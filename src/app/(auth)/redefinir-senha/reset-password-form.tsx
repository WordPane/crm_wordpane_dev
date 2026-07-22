"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/server/actions/auth";

/** Formulário de nova senha a partir do token recebido por e-mail. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await resetPassword({ token, password, confirmPassword });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Senha redefinida com sucesso. Entre com a nova senha.
        </p>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          className="bg-white/[0.03]"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          className="bg-white/[0.03]"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
