"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Play, Plus, Power, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompanyServiceItem } from "@/lib/queries/finance";
import type { Service } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  activateServiceSchema,
  chargeBillingTypeLabels,
  chargeBillingTypes,
  serviceBillingLabels,
  serviceBillings,
  serviceFormSchema,
  subscriptionCycleLabels,
  subscriptionCycles,
  type ActivateServiceValues,
  type ServiceFormValues,
} from "@/lib/validations/finance";
import {
  activateService,
  createService,
  deactivateService,
  toggleServiceActive,
  updateService,
} from "@/server/actions/finance";

type SelectOption = { id: string; name: string };

function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

/** Gestão do catálogo de serviços + ativação por empresa. */
export function ServiceManager({
  services,
  companyServices,
  companies,
  canManage,
}: {
  services: Service[];
  companyServices: CompanyServiceItem[];
  companies: SelectOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [activating, setActivating] = useState<Service | null>(null);
  const [deactivating, setDeactivating] = useState<CompanyServiceItem | null>(null);
  const [, startTransition] = useTransition();

  const activeServices = companyServices.filter((cs) => cs.status === "active");

  function handleToggle(service: Service) {
    startTransition(async () => {
      const result = await toggleServiceActive(service.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(service.active ? "Serviço desativado." : "Serviço ativado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* ─── Catálogo ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Catálogo de serviços</h2>
          {canManage && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus />
              Novo serviço
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Serviço</TableHead>
                <TableHead className="text-right">Valor padrão</TableHead>
                <TableHead>Cobrança</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum serviço cadastrado ainda.
                  </TableCell>
                </TableRow>
              ) : (
                services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell>
                      <p className="font-medium">{service.name}</p>
                      {service.description && (
                        <p className="text-xs text-muted-foreground">
                          {service.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(service.defaultValueCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {serviceBillingLabels[service.billing]}
                      {service.billing === "recurring" &&
                        ` · ${subscriptionCycleLabels[service.cycle]}`}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "chip",
                          !service.active &&
                            "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {service.active ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!service.active}
                          onClick={() => setActivating(service)}
                        >
                          <Play />
                          Ativar
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Editar ${service.name}`}
                              onClick={() => setEditing(service)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={
                                service.active
                                  ? `Desativar ${service.name}`
                                  : `Reativar ${service.name}`
                              }
                              onClick={() => handleToggle(service)}
                            >
                              <Power className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ─── Serviços ativos por empresa ─── */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Serviços ativos por cliente</h2>
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeServices.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum serviço recorrente ativo no momento.
                  </TableCell>
                </TableRow>
              ) : (
                activeServices.map((cs) => (
                  <TableRow key={cs.id}>
                    <TableCell className="font-medium">{cs.company.name}</TableCell>
                    <TableCell>
                      {cs.service.name}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        · {subscriptionCycleLabels[cs.service.cycle]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(cs.valueCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {chargeBillingTypeLabels[cs.billingType]}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeactivating(cs)}
                        >
                          <XCircle />
                          Cancelar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {editing && (
        <ServiceFormDialog
          service={editing === "new" ? null : editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}

      {activating && (
        <ActivateServiceDialog
          service={activating}
          companies={companies}
          open
          onOpenChange={(open) => {
            if (!open) setActivating(null);
          }}
        />
      )}

      {deactivating && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeactivating(null);
          }}
          title="Cancelar assinatura"
          description={`Cancelar a assinatura de "${deactivating.service.name}" para ${deactivating.company.name}? Cobranças já geradas permanecem ativas.`}
          confirmLabel="Cancelar assinatura"
          onConfirm={async () => {
            const result = await deactivateService(deactivating.id);
            if ("error" in result) return result.error;
            toast.success("Assinatura cancelada.");
            setDeactivating(null);
            router.refresh();
            return null;
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Dialog de serviço (criar/editar) ───────────────────────────

function ServiceFormDialog({
  service,
  open,
  onOpenChange,
}: {
  service: Service | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: service?.name ?? "",
      description: service?.description ?? "",
      defaultValue: service ? centsToInput(service.defaultValueCents) : "",
      billing: service?.billing ?? "one_time",
      cycle: service?.cycle ?? "monthly",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const billing = useWatch({ control: form.control, name: "billing" });

  async function onSubmit(values: ServiceFormValues) {
    setError(null);
    const result = service
      ? await updateService(service.id, values)
      : await createService(values);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success(service ? "Serviço atualizado." : "Serviço criado.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>
            Serviços recorrentes geram cobranças automaticamente a cada ciclo
            via assinatura do Asaas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Nome *" htmlFor="sv-name" error={errors.name?.message}>
            <Input
              id="sv-name"
              placeholder="Ex.: Manutenção mensal do site"
              {...form.register("name")}
            />
          </Field>

          <Field label="Descrição" error={errors.description?.message}>
            <Input
              placeholder="Opcional"
              {...form.register("description")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Valor padrão (R$) *"
              htmlFor="sv-value"
              error={errors.defaultValue?.message}
            >
              <Input
                id="sv-value"
                inputMode="decimal"
                placeholder="0,00"
                {...form.register("defaultValue")}
              />
            </Field>

            <Field label="Tipo *">
              <Controller
                control={form.control}
                name="billing"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) => {
                          const b = serviceBillings.find((b) => b === value);
                          return b ? serviceBillingLabels[b] : "";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {serviceBillings.map((b) => (
                        <SelectItem key={b} value={b}>
                          {serviceBillingLabels[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {billing === "recurring" && (
              <Field label="Ciclo *">
                <Controller
                  control={form.control}
                  name="cycle"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => field.onChange(value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: string | null) => {
                            const c = subscriptionCycles.find((c) => c === value);
                            return c ? subscriptionCycleLabels[c] : "";
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {subscriptionCycles.map((c) => (
                          <SelectItem key={c} value={c}>
                            {subscriptionCycleLabels[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── Dialog de ativação ───────────────────────────

function ActivateServiceDialog({
  service,
  companies,
  open,
  onOpenChange,
}: {
  service: Service;
  companies: SelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ActivateServiceValues>({
    resolver: zodResolver(activateServiceSchema),
    defaultValues: {
      companyId: "",
      serviceId: service.id,
      value: "",
      billingType: "pix",
      firstDueDate: "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ActivateServiceValues) {
    setError(null);
    const result = await activateService(values);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success(
      service.billing === "recurring"
        ? "Assinatura criada no Asaas."
        : "Cobrança criada e enviada ao Asaas.",
    );
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ativar: {service.name}</DialogTitle>
          <DialogDescription>
            {service.billing === "recurring"
              ? `Assinatura ${subscriptionCycleLabels[
                  service.cycle
                ].toLowerCase()} — o Asaas gera as cobranças a cada ciclo.`
              : "Serviço avulso — uma cobrança será criada imediatamente."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Empresa *" error={errors.companyId?.message}>
            <Controller
              control={form.control}
              name="companyId"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={(value) => field.onChange(value)}
                >
                  <SelectTrigger className="w-full">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Valor (R$) — padrão ${centsToInput(service.defaultValueCents)}`}
              htmlFor="act-value"
              error={errors.value?.message}
            >
              <Input
                id="act-value"
                inputMode="decimal"
                placeholder={centsToInput(service.defaultValueCents)}
                {...form.register("value")}
              />
            </Field>

            <Field label="Meio de pagamento *">
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
          </div>

          <Field
            label="Vencimento da 1ª cobrança *"
            htmlFor="act-due"
            error={errors.firstDueDate?.message}
          >
            <Input id="act-due" type="date" {...form.register("firstDueDate")} />
          </Field>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Ativar serviço
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
