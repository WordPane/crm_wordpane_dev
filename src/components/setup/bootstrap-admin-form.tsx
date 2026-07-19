"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapSuperAdmin } from "@/server/actions/setup";

/** Passo 1 do wizard /setup: cria o primeiro super admin da instância. */
export function BootstrapAdminForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await bootstrapSuperAdmin({ name, email, password });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Super admin criado. Entre para continuar a configuração.");
      router.push("/login");
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="boot-name">Seu nome *</Label>
        <Input
          id="boot-name"
          autoComplete="name"
          placeholder="Ex.: Maria Souza"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="boot-email">E-mail de acesso *</Label>
        <Input
          id="boot-email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="boot-password">Senha *</Label>
        <Input
          id="boot-password"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo de 6 caracteres"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        className="w-full"
        disabled={pending || !name.trim() || !email.trim() || password.length < 6}
        onClick={submit}
      >
        {pending && <Loader2 className="animate-spin" />}
        Criar super admin
      </Button>
    </div>
  );
}
