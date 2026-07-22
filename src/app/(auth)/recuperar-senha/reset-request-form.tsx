"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/server/actions/auth";

/** Pedido de recuperação: resposta genérica para não revelar e-mails cadastrados. */
export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset({ email });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-primary" />
        <p className="text-sm text-muted-foreground">
          Se este e-mail estiver cadastrado, você receberá em instantes o link
          para redefinir a senha. Ele expira em 1 hora.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? "Enviando..." : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}
