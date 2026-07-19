"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  chargeBillingTypeLabels,
  chargeBillingTypes,
  chargeFormSchema,
  type ChargeFormValues,
} from "@/lib/validations/finance";
import { createCharge } from "@/server/actions/finance";

type SelectOption = { id: string; name: string };

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Formulário de nova cobrança avulsa (gera o pagamento no Asaas). */
export function ChargeForm({
  companies,
  defaultCompanyId,
}: {
  companies: SelectOption[];
  defaultCompanyId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<ChargeFormValues>({
    resolver: zodResolver(chargeFormSchema),
    defaultValues: {
      companyId: defaultCompanyId ?? "",
      description: "",
      value: "",
      billingType: "pix",
      dueDate: "",
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: ChargeFormValues) {
    setError(null);
    startTransition(async () => {
      const result = await createCharge(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Cobrança criada e enviada ao Asaas.");
      router.push("/admin/financeiro");
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <Field label="Empresa *" error={errors.companyId?.message}>
        <Controller
          control={form.control}
          name="companyId"
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.companyId}>
                <SelectValue placeholder="Selecione a empresa">
                  {(value: string | null) =>
                    !value
                      ? "Selecione a empresa"
                      : (companies.find((c) => c.id === value)?.name ??
                        "Selecione a empresa")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <Field
        label="Descrição *"
        htmlFor="cf-description"
        error={errors.description?.message}
      >
        <Input
          id="cf-description"
          placeholder="Ex.: Desenvolvimento do site institucional"
          aria-invalid={!!errors.description}
          {...form.register("description")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Valor (R$) *" htmlFor="cf-value" error={errors.value?.message}>
          <Input
            id="cf-value"
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={!!errors.value}
            {...form.register("value")}
          />
        </Field>

        <Field label="Meio de pagamento *" error={errors.billingType?.message}>
          <Controller
            control={form.control}
            name="billingType"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => {
                      const t = chargeBillingTypes.find((t) => t === value);
                      return t ? chargeBillingTypeLabels[t] : "";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {chargeBillingTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {chargeBillingTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field label="Vencimento *" htmlFor="cf-due" error={errors.dueDate?.message}>
          <Input id="cf-due" type="date" {...form.register("dueDate")} />
        </Field>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Criar cobrança
        </Button>
      </div>
    </form>
  );
}
