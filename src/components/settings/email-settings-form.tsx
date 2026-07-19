"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MaskedEmailSettings } from "@/lib/email/settings";
import {
  emailSettingsSchema,
  type EmailSettingsValues,
} from "@/lib/validations/settings";
import {
  sendTestEmail,
  updateEmailSettings,
} from "@/server/actions/email-settings";

export function EmailSettingsForm({
  appName,
  settings,
}: {
  appName: string;
  settings: MaskedEmailSettings | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaveTransition] = useTransition();
  const [testing, startTestTransition] = useTransition();

  const form = useForm<EmailSettingsValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      host: settings?.host ?? "",
      port: settings?.port ?? 587,
      secure: settings?.secure ?? false,
      user: settings?.user ?? "",
      password: "",
      fromEmail: settings?.fromEmail ?? "",
      fromName: settings?.fromName ?? appName,
      appUrl:
        settings?.appUrl ??
        (typeof window !== "undefined" ? window.location.origin : ""),
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: EmailSettingsValues) {
    setError(null);
    startSaveTransition(async () => {
      const result = await updateEmailSettings(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Configurações de e-mail salvas.");
      form.reset({ ...values, password: "" });
      router.refresh();
    });
  }

  function onTest() {
    startTestTransition(async () => {
      const result = await sendTestEmail();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("E-mail de teste enviado. Verifique sua caixa de entrada.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mail (SMTP)</CardTitle>
        <CardDescription>
          Servidor usado para enviar notificações e e-mails transacionais do
          CRM. A senha fica criptografada no banco.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">Host *</Label>
              <Input
                id="smtp-host"
                placeholder="Ex.: smtp.resend.com"
                aria-invalid={!!errors.host}
                {...form.register("host")}
              />
              {errors.host && (
                <p className="text-xs text-destructive">{errors.host.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">Porta *</Label>
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                placeholder="587"
                aria-invalid={!!errors.port}
                {...form.register("port", { valueAsNumber: true })}
              />
              {errors.port && (
                <p className="text-xs text-destructive">{errors.port.message}</p>
              )}
            </div>
          </div>

          <Controller
            control={form.control}
            name="secure"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="smtp-secure"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
                <Label htmlFor="smtp-secure" className="font-normal">
                  SSL/TLS (porta 465; deixe desmarcado para STARTTLS na 587)
                </Label>
              </div>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-user">Usuário *</Label>
              <Input
                id="smtp-user"
                autoComplete="off"
                placeholder="Usuário ou e-mail de autenticação"
                aria-invalid={!!errors.user}
                {...form.register("user")}
              />
              {errors.user && (
                <p className="text-xs text-destructive">{errors.user.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-password">
                Senha{settings?.hasPassword ? "" : " *"}
              </Label>
              <Input
                id="smtp-password"
                type="password"
                autoComplete="new-password"
                placeholder={
                  settings?.hasPassword
                    ? "•••••••• (deixe em branco para manter)"
                    : "Senha do SMTP"
                }
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-email">Remetente (e-mail) *</Label>
              <Input
                id="smtp-from-email"
                type="email"
                placeholder="Ex.: no-reply@empresa.com"
                aria-invalid={!!errors.fromEmail}
                {...form.register("fromEmail")}
              />
              {errors.fromEmail && (
                <p className="text-xs text-destructive">
                  {errors.fromEmail.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-name">Nome do remetente *</Label>
              <Input
                id="smtp-from-name"
                placeholder={`Ex.: ${appName}`}
                aria-invalid={!!errors.fromName}
                {...form.register("fromName")}
              />
              {errors.fromName && (
                <p className="text-xs text-destructive">
                  {errors.fromName.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="smtp-app-url">URL pública do app *</Label>
            <Input
              id="smtp-app-url"
              type="url"
              placeholder="Ex.: https://crm.empresa.com"
              aria-invalid={!!errors.appUrl}
              {...form.register("appUrl")}
            />
            <p className="text-xs text-muted-foreground">
              Usada como base dos links enviados nos e-mails (login, &ldquo;Ver
              no CRM&rdquo; e logo).
            </p>
            {errors.appUrl && (
              <p className="text-xs text-destructive">
                {errors.appUrl.message}
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={testing || saving}
              onClick={onTest}
            >
              {testing ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar e-mail de teste
            </Button>
            <Button type="submit" disabled={saving || testing}>
              {saving && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
