"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  portalProfileSchema,
  type PortalProfileValues,
} from "@/lib/validations/portal";
import { updatePortalProfile } from "@/server/actions/portal";

/** Dados pessoais do cliente (nome, telefone, cargo) — e-mail é fixo. */
export function PortalProfileForm({
  appName,
  email,
  defaultValues,
}: {
  appName: string;
  email: string;
  defaultValues: PortalProfileValues;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<PortalProfileValues>({
    resolver: zodResolver(portalProfileSchema),
    defaultValues,
  });
  const { errors } = form.formState;

  function onSubmit(values: PortalProfileValues) {
    setError(null);
    startTransition(async () => {
      const result = await updatePortalProfile(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Perfil atualizado.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pf-name">Nome *</Label>
        <Input
          id="pf-name"
          placeholder="Seu nome completo"
          aria-invalid={!!errors.name}
          {...form.register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-email">E-mail</Label>
        <Input id="pf-email" value={email} disabled />
        <p className="text-xs text-muted-foreground">
          O e-mail de acesso é gerenciado pela equipe {appName}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-phone">Telefone</Label>
          <Input
            id="pf-phone"
            placeholder="(00) 00000-0000"
            aria-invalid={!!errors.phone}
            {...form.register("phone")}
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-position">Cargo</Label>
          <Input
            id="pf-position"
            placeholder="Ex.: Gerente de marketing"
            aria-invalid={!!errors.position}
            {...form.register("position")}
          />
          {errors.position && (
            <p className="text-xs text-destructive">{errors.position.message}</p>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
