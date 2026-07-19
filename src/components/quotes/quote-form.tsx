"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import {
  emptyQuoteValues,
  parseCurrencyToCents,
  parseQuantity,
  quoteFormSchema,
  type QuoteFormValues,
  type QuotePayload,
} from "@/lib/validations/quote";
import { createQuote, updateQuote } from "@/server/actions/quotes";

type SelectOption = { id: string; name: string };
/** Serviço do catálogo para o seletor de itens (preenche descrição e valor). */
type QuoteServiceOption = {
  id: string;
  name: string;
  defaultValueCents: number;
};

/** 123456 → "1.234,56" (formato dos inputs monetários do formulário). */
function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type QuoteFormProps =
  | {
      mode: "create";
      companies: SelectOption[];
      services: QuoteServiceOption[];
      defaultCompanyId?: string;
    }
  | {
      mode: "edit";
      quoteId: string;
      companies: SelectOption[];
      services: QuoteServiceOption[];
      defaultValues: QuoteFormValues;
    };

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

const MANUAL = "__manual__";

export function QuoteForm(props: QuoteFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : {
            ...emptyQuoteValues,
            companyId: props.defaultCompanyId ?? "",
          },
  });
  const { errors } = form.formState;
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Totais ao vivo: refletem o que será salvo (pt-BR: vírgula = decimal)
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedDiscount = useWatch({ control: form.control, name: "discount" });
  const subtotalCents = watchedItems.reduce((sum, item) => {
    const quantity = parseQuantity(item.quantity);
    const unitPriceCents = parseCurrencyToCents(item.unitPrice);
    if (quantity === null || unitPriceCents === null) return sum;
    return sum + Math.round(quantity * unitPriceCents);
  }, 0);
  const discountCents = parseCurrencyToCents(watchedDiscount) ?? 0;
  const totalCents = subtotalCents - discountCents;

  function onSubmit(values: QuoteFormValues) {
    setError(null);

    const items: QuotePayload["items"] = [];
    for (const [index, item] of values.items.entries()) {
      const quantity = parseQuantity(item.quantity);
      const unitPriceCents = parseCurrencyToCents(item.unitPrice);
      if (quantity === null) {
        setError(`Item ${index + 1}: quantidade inválida (ex.: 1,5).`);
        return;
      }
      if (unitPriceCents === null) {
        setError(`Item ${index + 1}: valor unitário inválido (ex.: 1.500,00).`);
        return;
      }
      items.push({
        description: item.description.trim(),
        quantity,
        unitPriceCents,
        serviceId: item.serviceId || "",
      });
    }

    const parsedDiscount = parseCurrencyToCents(values.discount);
    if (parsedDiscount === null) {
      setError("Desconto inválido (ex.: 500,00).");
      return;
    }

    const payload: QuotePayload = {
      companyId: values.companyId,
      title: values.title,
      validUntil: values.validUntil,
      notes: values.notes,
      discountCents: parsedDiscount,
      items,
    };

    startTransition(async () => {
      const result =
        props.mode === "edit"
          ? await updateQuote(props.quoteId, payload)
          : await createQuote(payload);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      if (props.mode === "create") {
        toast.success("Orçamento criado como rascunho.");
        router.push(
          result.id ? `/admin/orcamentos/${result.id}` : "/admin/orcamentos",
        );
      } else {
        toast.success("Orçamento atualizado.");
        router.push(`/admin/orcamentos/${props.quoteId}`);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Título do orçamento *"
          htmlFor="qf-title"
          error={errors.title?.message}
        >
          <Input
            id="qf-title"
            placeholder="Ex.: Desenvolvimento do novo site"
            aria-invalid={!!errors.title}
            {...form.register("title")}
          />
        </Field>

        <Field label="Empresa *" error={errors.companyId?.message}>
          <Controller
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger
                  className="w-full"
                  aria-invalid={!!errors.companyId}
                >
                  <SelectValue placeholder="Selecione a empresa">
                    {(value: string | null) =>
                      !value
                        ? "Selecione a empresa"
                        : (props.companies.find((c) => c.id === value)?.name ??
                          "Selecione a empresa")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {props.companies.map((c) => (
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
          label="Validade"
          htmlFor="qf-valid"
          error={errors.validUntil?.message}
        >
          <Input id="qf-valid" type="date" {...form.register("validUntil")} />
        </Field>

        <Field
          label="Desconto (R$)"
          htmlFor="qf-discount"
          error={errors.discount?.message}
        >
          <Input
            id="qf-discount"
            inputMode="decimal"
            placeholder="0,00"
            {...form.register("discount")}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Itens do orçamento *</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({ description: "", quantity: "1", unitPrice: "", serviceId: "" })
            }
          >
            <Plus />
            Adicionar item
          </Button>
        </div>
        {errors.items?.root?.message && (
          <p className="text-xs text-destructive">{errors.items.root.message}</p>
        )}
        {typeof errors.items?.message === "string" && (
          <p className="text-xs text-destructive">{errors.items.message}</p>
        )}

        <div className="space-y-2">
          {fields.map((field, index) => {
            const quantity = parseQuantity(watchedItems[index]?.quantity ?? "");
            const unitPriceCents = parseCurrencyToCents(
              watchedItems[index]?.unitPrice ?? "",
            );
            const lineTotal =
              quantity !== null && unitPriceCents !== null
                ? Math.round(quantity * unitPriceCents)
                : null;

            return (
              <div
                key={field.id}
                className="flex flex-wrap items-start gap-2 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/10"
              >
                <div className="min-w-48 flex-1 space-y-1">
                  {props.services.length > 0 && (
                    <Select
                      value={watchedItems[index]?.serviceId || MANUAL}
                      onValueChange={(value) => {
                        const serviceId = !value || value === MANUAL ? "" : value;
                        form.setValue(`items.${index}.serviceId`, serviceId);
                        if (serviceId) {
                          const service = props.services.find(
                            (s) => s.id === serviceId,
                          );
                          if (service) {
                            form.setValue(
                              `items.${index}.description`,
                              service.name,
                              { shouldValidate: true },
                            );
                            form.setValue(
                              `items.${index}.unitPrice`,
                              centsToInput(service.defaultValueCents),
                            );
                          }
                        }
                      }}
                    >
                      <SelectTrigger
                        className="h-7 text-xs"
                        aria-label="Serviço do catálogo"
                      >
                        <SelectValue placeholder="Do catálogo (opcional)">
                          {(value: string | null) =>
                            !value || value === MANUAL
                              ? "Do catálogo (opcional)"
                              : (props.services.find((s) => s.id === value)
                                  ?.name ?? "Do catálogo (opcional)")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MANUAL}>
                          Digitar manualmente
                        </SelectItem>
                        {props.services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    placeholder={`Descrição do item ${index + 1}`}
                    aria-invalid={!!errors.items?.[index]?.description}
                    {...form.register(`items.${index}.description`)}
                  />
                  {errors.items?.[index]?.description && (
                    <p className="text-xs text-destructive">
                      {errors.items[index].description.message}
                    </p>
                  )}
                </div>
                <Input
                  className="w-24"
                  inputMode="decimal"
                  placeholder="Qtd."
                  title="Quantidade"
                  {...form.register(`items.${index}.quantity`)}
                />
                <Input
                  className="w-32"
                  inputMode="decimal"
                  placeholder="Valor unit."
                  title="Valor unitário (R$)"
                  {...form.register(`items.${index}.unitPrice`)}
                />
                <div className="flex h-9 w-28 items-center justify-end text-sm font-medium">
                  {lineTotal !== null ? formatCurrency(lineTotal) : "—"}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover item"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="space-y-1 rounded-xl bg-card p-4 text-sm ring-1 ring-foreground/10">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotalCents)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Desconto</span>
            <span>− {formatCurrency(discountCents)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
            <span>Total</span>
            <span className={cn(totalCents < 0 && "text-destructive")}>
              {formatCurrency(totalCents)}
            </span>
          </div>
        </div>
      </div>

      <Field label="Observações" error={errors.notes?.message}>
        <Textarea
          placeholder="Condições de pagamento, prazos, escopo..."
          rows={4}
          {...form.register("notes")}
        />
      </Field>

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
        <Button type="submit" disabled={pending || totalCents < 0}>
          {pending && <Loader2 className="animate-spin" />}
          {props.mode === "edit" ? "Salvar alterações" : "Criar orçamento"}
        </Button>
      </div>
    </form>
  );
}
