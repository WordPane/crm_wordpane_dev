"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import type { IssuerInfo } from "@/lib/issuer";
import {
  issuerSettingsSchema,
  type IssuerSettingsValues,
} from "@/lib/validations/settings";
import { updateIssuerSettings } from "@/server/actions/issuer-settings";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Dados da própria empresa exibidos no PDF do orçamento (bloco "Emitente"). */
export function IssuerSettingsForm({ issuer }: { issuer: IssuerInfo }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<IssuerSettingsValues>({
    resolver: zodResolver(issuerSettingsSchema),
    defaultValues: issuer,
  });
  const { errors } = form.formState;

  function onSubmit(values: IssuerSettingsValues) {
    setError(null);
    startTransition(async () => {
      const result = await updateIssuerSettings(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Dados do emissor salvos.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emissor (PDF do orçamento)</CardTitle>
        <CardDescription>
          Dados da sua empresa exibidos no cabeçalho e no rodapé do PDF do
          orçamento enviado ao cliente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome de exibição *"
              htmlFor="iss-name"
              error={errors.displayName?.message}
            >
              <Input
                id="iss-name"
                placeholder="WordPane"
                {...form.register("displayName")}
              />
            </Field>
            <Field
              label="Razão social *"
              htmlFor="iss-razao"
              error={errors.razaoSocial?.message}
            >
              <Input
                id="iss-razao"
                placeholder="Empresa LTDA"
                {...form.register("razaoSocial")}
              />
            </Field>
            <Field label="CNPJ *" htmlFor="iss-cnpj" error={errors.cnpj?.message}>
              <Input
                id="iss-cnpj"
                placeholder="00.000.000/0000-00"
                {...form.register("cnpj")}
              />
            </Field>
            <Field
              label="Telefone *"
              htmlFor="iss-phone"
              error={errors.phone?.message}
            >
              <Input
                id="iss-phone"
                placeholder="(00) 00000-0000"
                {...form.register("phone")}
              />
            </Field>
            <Field label="E-mail *" htmlFor="iss-email" error={errors.email?.message}>
              <Input
                id="iss-email"
                type="email"
                placeholder="contato@empresa.com"
                {...form.register("email")}
              />
            </Field>
            <Field
              label="Endereço completo *"
              htmlFor="iss-address"
              error={errors.addressLine?.message}
            >
              <Input
                id="iss-address"
                placeholder="Rua, número — bairro, cidade/UF — CEP"
                {...form.register("addressLine")}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Código do serviço (NFS-e) *"
              htmlFor="iss-service-code"
              error={errors.serviceCode?.message}
            >
              <Input
                id="iss-service-code"
                placeholder="01.01"
                {...form.register("serviceCode")}
              />
            </Field>
            <Field
              label="Nome do serviço (NFS-e) *"
              htmlFor="iss-service-name"
              error={errors.serviceName?.message}
            >
              <Input
                id="iss-service-name"
                placeholder="Análise e desenvolvimento de sistemas"
                {...form.register("serviceName")}
              />
            </Field>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
