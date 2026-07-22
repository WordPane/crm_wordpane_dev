"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authenticate, type LoginState } from "@/server/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    authenticate,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="voce@empresa.com"
          className="bg-white/[0.03]"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="bg-white/[0.03]"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="text-center text-sm">
        <Link
          href="/recuperar-senha"
          className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Esqueci a senha
        </Link>
      </p>
    </form>
  );
}
