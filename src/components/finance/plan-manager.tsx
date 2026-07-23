"use client";

import { Loader2, Package, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import type { MaintenancePackage, MaintenancePlan } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/utils/format";
import {
  createMaintenancePackage,
  createMaintenancePlan,
  toggleMaintenancePackage,
  toggleMaintenancePlan,
  updateMaintenancePackage,
  updateMaintenancePlan,
} from "@/server/actions/maintenance";

/** 49000 → "490,00" (formato aceito por parseCurrencyToCents). */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

type PlanDraft = {
  name: string;
  description: string;
  adjustmentsLimit: string;
  pagesLimit: string;
  value: string;
};

type PackageDraft = {
  name: string;
  adjustments: string;
  pages: string;
  value: string;
};

const emptyPlan: PlanDraft = {
  name: "",
  description: "",
  adjustmentsLimit: "5",
  pagesLimit: "1",
  value: "",
};

const emptyPackage: PackageDraft = {
  name: "",
  adjustments: "3",
  pages: "0",
  value: "",
};

/** Gestão dos planos de manutenção e pacotes extras — super admin. */
export function PlanManager({
  plans,
  packages,
  canManage = true,
}: {
  plans: MaintenancePlan[];
  packages: MaintenancePackage[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const [packageDraft, setPackageDraft] = useState<PackageDraft | null>(null);
  const [editingPackage, setEditingPackage] = useState<MaintenancePackage | null>(null);
  const [pending, startTransition] = useTransition();

  function togglePlan(plan: MaintenancePlan) {
    startTransition(async () => {
      const result = await toggleMaintenancePlan(plan.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(plan.active ? "Plano desativado." : "Plano ativado.");
      router.refresh();
    });
  }

  function togglePackage(pkg: MaintenancePackage) {
    startTransition(async () => {
      const result = await toggleMaintenancePackage(pkg.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(pkg.active ? "Pacote desativado." : "Pacote ativado.");
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Planos de manutenção</CardTitle>
          <CardDescription>
            Cotas mensais de demandas (ajustes e páginas novas) atribuídas a
            projetos de clientes. A cota renova a cada ciclo mensal.
          </CardDescription>
          {canManage && (
            <CardAction>
              <Button size="sm" onClick={() => setPlanDraft(emptyPlan)}>
                <Plus />
                Novo plano
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum plano cadastrado. Crie o primeiro para controlar as
              demandas de manutenção por projeto.
            </p>
          ) : (
            <ul className="space-y-2">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 ring-1 ring-border"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                    <ShieldCheck className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {plan.name}
                      {!plan.active && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (inativo)
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {plan.adjustmentsLimit} ajustes/mês · {plan.pagesLimit}{" "}
                      páginas/mês · {formatCurrency(plan.valueCents)}/mês
                    </span>
                  </span>
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => togglePlan(plan)}
                      >
                        {plan.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${plan.name}`}
                        onClick={() => setEditingPlan(plan)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pacotes extras</CardTitle>
          <CardDescription>
            Créditos avulsos que o cliente compra quando a cota mensal do
            plano acaba. Consomem na ordem de compra e não expiram.
          </CardDescription>
          {canManage && (
            <CardAction>
              <Button size="sm" onClick={() => setPackageDraft(emptyPackage)}>
                <Plus />
                Novo pacote
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {packages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum pacote cadastrado. Pacotes extras ficam disponíveis para
              compra no portal do cliente.
            </p>
          ) : (
            <ul className="space-y-2">
              {packages.map((pkg) => (
                <li
                  key={pkg.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 ring-1 ring-border"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                    <Package className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {pkg.name}
                      {!pkg.active && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (inativo)
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      +{pkg.adjustments} ajustes · +{pkg.pages} páginas ·{" "}
                      {formatCurrency(pkg.valueCents)}
                    </span>
                  </span>
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => togglePackage(pkg)}
                      >
                        {pkg.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${pkg.name}`}
                        onClick={() => setEditingPackage(pkg)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(planDraft || editingPlan) && (
        <PlanEditorDialog
          plan={editingPlan}
          draft={planDraft}
          onClose={() => {
            setPlanDraft(null);
            setEditingPlan(null);
          }}
        />
      )}
      {(packageDraft || editingPackage) && (
        <PackageEditorDialog
          pkg={editingPackage}
          draft={packageDraft}
          onClose={() => {
            setPackageDraft(null);
            setEditingPackage(null);
          }}
        />
      )}
    </>
  );
}

function PlanEditorDialog({
  plan,
  draft,
  onClose,
}: {
  plan: MaintenancePlan | null;
  draft: PlanDraft | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<PlanDraft>(
    plan
      ? {
          name: plan.name,
          description: plan.description ?? "",
          adjustmentsLimit: String(plan.adjustmentsLimit),
          pagesLimit: String(plan.pagesLimit),
          value: centsToInput(plan.valueCents),
        }
      : (draft ?? emptyPlan),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const payload = {
        name: form.name,
        description: form.description,
        adjustmentsLimit: form.adjustmentsLimit,
        pagesLimit: form.pagesLimit,
        value: form.value,
      };
      const result = plan
        ? await updateMaintenancePlan(plan.id, payload)
        : await createMaintenancePlan(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(plan ? "Plano atualizado." : "Plano criado.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? "Editar plano" : "Novo plano"}</DialogTitle>
          <DialogDescription>
            Cotas mensais de demandas para projetos com manutenção.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Nome *</Label>
            <Input
              id="plan-name"
              placeholder="Ex.: Manutenção Essencial"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-desc">Descrição</Label>
            <Textarea
              id="plan-desc"
              rows={2}
              placeholder="O que o plano cobre (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-adj">Ajustes/mês *</Label>
              <Input
                id="plan-adj"
                type="number"
                min={0}
                value={form.adjustmentsLimit}
                onChange={(e) =>
                  setForm({ ...form, adjustmentsLimit: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-pages">Páginas/mês *</Label>
              <Input
                id="plan-pages"
                type="number"
                min={0}
                value={form.pagesLimit}
                onChange={(e) => setForm({ ...form, pagesLimit: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-value">Valor mensal *</Label>
              <Input
                id="plan-value"
                placeholder="490,00"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {plan ? "Salvar alterações" : "Criar plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PackageEditorDialog({
  pkg,
  draft,
  onClose,
}: {
  pkg: MaintenancePackage | null;
  draft: PackageDraft | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<PackageDraft>(
    pkg
      ? {
          name: pkg.name,
          adjustments: String(pkg.adjustments),
          pages: String(pkg.pages),
          value: centsToInput(pkg.valueCents),
        }
      : (draft ?? emptyPackage),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const payload = {
        name: form.name,
        adjustments: form.adjustments,
        pages: form.pages,
        value: form.value,
      };
      const result = pkg
        ? await updateMaintenancePackage(pkg.id, payload)
        : await createMaintenancePackage(payload);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(pkg ? "Pacote atualizado." : "Pacote criado.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pkg ? "Editar pacote" : "Novo pacote"}</DialogTitle>
          <DialogDescription>
            Créditos avulsos vendidos no portal quando a cota mensal acaba.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-name">Nome *</Label>
            <Input
              id="pkg-name"
              placeholder="Ex.: Pacote 5 ajustes"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-adj">Ajustes *</Label>
              <Input
                id="pkg-adj"
                type="number"
                min={0}
                value={form.adjustments}
                onChange={(e) => setForm({ ...form, adjustments: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-pages">Páginas *</Label>
              <Input
                id="pkg-pages"
                type="number"
                min={0}
                value={form.pages}
                onChange={(e) => setForm({ ...form, pages: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-value">Valor *</Label>
              <Input
                id="pkg-value"
                placeholder="190,00"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pkg ? "Salvar alterações" : "Criar pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
