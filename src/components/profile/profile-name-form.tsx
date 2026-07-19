"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  profileNameSchema,
  type ProfileNameValues,
} from "@/lib/validations/profile";
import { updateOwnProfile } from "@/server/actions/profile";

export function ProfileNameForm({
  appName,
  defaultName,
  email,
}: {
  appName: string;
  defaultName: string;
  email: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<ProfileNameValues>({
    resolver: zodResolver(profileNameSchema),
    defaultValues: { name: defaultName },
  });
  const { errors } = form.formState;

  function onSubmit(values: ProfileNameValues) {
    setError(null);
    startTransition(async () => {
      const result = await updateOwnProfile(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Nome atualizado.");
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="pf-name">Nome *</Label>
        <Input
          id="pf-name"
          aria-invalid={!!errors.name}
          {...form.register("name")}
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-email">E-mail</Label>
        <Input id="pf-email" value={email} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          O e-mail de acesso só pode ser alterado pela equipe {appName}.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Salvar nome
      </Button>
    </form>
  );
}
