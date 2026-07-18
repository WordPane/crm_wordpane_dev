"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  portalPasswordSchema,
  type PortalPasswordValues,
} from "@/lib/validations/portal";
import { changePortalPassword } from "@/server/actions/portal";

/** Troca de senha do próprio usuário (confere a senha atual). */
export function PortalPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<PortalPasswordValues>({
    resolver: zodResolver(portalPasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: PortalPasswordValues) {
    setError(null);
    startTransition(async () => {
      const result = await changePortalPassword(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      form.reset();
      toast.success("Senha alterada com sucesso.");
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pw-current">Senha atual *</Label>
        <Input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          {...form.register("currentPassword")}
        />
        {errors.currentPassword && (
          <p className="text-xs text-destructive">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pw-new">Nova senha *</Label>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            {...form.register("newPassword")}
          />
          {errors.newPassword ? (
            <p className="text-xs text-destructive">
              {errors.newPassword.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-confirm">Confirmar nova senha *</Label>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            {...form.register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
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
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Alterar senha
        </Button>
      </div>
    </form>
  );
}
