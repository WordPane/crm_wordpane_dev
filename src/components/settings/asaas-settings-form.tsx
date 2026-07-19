"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Loader2, PlugZap } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MaskedAsaasSettings } from "@/lib/asaas/settings";
import {
  asaasSettingsSchema,
  type AsaasSettingsValues,
} from "@/lib/validations/settings";
import { testAsaas, updateAsaasSettings } from "@/server/actions/asaas-settings";

function copyToClipboard(value: string, label: string) {
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copiado.`),
    () => toast.error("Não foi possível copiar."),
  );
}

export function AsaasSettingsForm({
  settings,
  appUrl,
}: {
  settings: MaskedAsaasSettings | null;
  appUrl: string | undefined;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaveTransition] = useTransition();
  const [testing, startTestTransition] = useTransition();

  const form = useForm<AsaasSettingsValues>({
    resolver: zodResolver(asaasSettingsSchema),
    defaultValues: {
      environment: settings?.environment ?? "sandbox",
      apiKey: "",
    },
  });
  const { errors } = form.formState;

  const webhookUrl = `${appUrl ?? (typeof window !== "undefined" ? window.location.origin : "")}/api/webhooks/asaas`;

  function onSubmit(values: AsaasSettingsValues) {
    setError(null);
    startSaveTransition(async () => {
      const result = await updateAsaasSettings(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Configurações do Asaas salvas.");
      form.reset({ ...values, apiKey: "" });
      router.refresh();
    });
  }

  function onTest() {
    startTestTransition(async () => {
      const result = await testAsaas();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Conexão com o Asaas funcionando.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asaas (cobranças)</CardTitle>
        <CardDescription>
          Gateway de pagamento usado pelo financeiro (PIX, boleto e cartão). A
          API key fica criptografada no banco. Comece pelo ambiente sandbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Ambiente *</Label>
              <Controller
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) =>
                          value === "production" ? "Produção" : "Sandbox (testes)"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                      <SelectItem value="production">Produção</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asaas-key">
                API key{settings?.hasApiKey ? "" : " *"}
              </Label>
              <Input
                id="asaas-key"
                type="password"
                autoComplete="new-password"
                placeholder={
                  settings?.hasApiKey
                    ? "•••••••• (deixe em branco para manter)"
                    : "$aact_hmlg_... ou $aact_prod_..."
                }
                aria-invalid={!!errors.apiKey}
                {...form.register("apiKey")}
              />
              {errors.apiKey && (
                <p className="text-xs text-destructive">
                  {errors.apiKey.message}
                </p>
              )}
            </div>
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
              {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
              Testar conexão
            </Button>
            <Button type="submit" disabled={saving || testing}>
              {saving && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>

        {settings?.webhookToken && (
          <div className="space-y-2 rounded-xl bg-muted/40 p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-medium">Webhook</p>
            <p className="text-xs text-muted-foreground">
              Cadastre no painel do Asaas (Integrações → Webhooks) a URL abaixo
              com os eventos de cobrança (PAYMENT_*), usando o token no campo
              de autenticação:
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1.5 text-xs">
                {webhookUrl}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Copiar URL do webhook"
                onClick={() => copyToClipboard(webhookUrl, "URL do webhook")}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1.5 text-xs">
                Token: {settings.webhookToken}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Copiar token do webhook"
                onClick={() =>
                  copyToClipboard(settings.webhookToken, "Token do webhook")
                }
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
