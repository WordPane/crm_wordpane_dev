"use client";

import { Loader2, Pencil, Plus, ShieldCheck, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MaintenancePackage, MaintenancePlan } from "@/lib/db/schema";
import type { ProjectPlanBalance } from "@/lib/queries/maintenance";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import {
  activateCompanyPlan,
  addPackageToPlan,
  cancelCompanyPlan,
  cancelProjectPlanPackage,
  changeCompanyPlan,
  updateCompanyPlanCoverage,
} from "@/server/actions/maintenance";

const packageStatusLabels: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  active: "Ativo",
  cancelled: "Cancelado",
};

const billingModeLabels: Record<string, string> = {
  manual: "Manual",
  one_time: "Mensal avulso",
  recurring: "Assinatura recorrente",
};

function QuotaRow({
  label,
  used,
  limit,
  credits,
}: {
  label: string;
  used: number;
  limit: number;
  credits: number;
}) {
  const pct =
    limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : used > 0 ? 100 : 0;
  const exhausted = used >= limit && credits <= 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={exhausted ? "font-semibold text-[#ff6b6b]" : "font-semibold"}>
          {used}/{limit}
          {credits > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">
              (+{credits} em pacotes)
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${exhausted ? "bg-[#ff6b6b]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type CatalogPlan = Pick<
  MaintenancePlan,
  "id" | "name" | "adjustmentsLimit" | "pagesLimit"
>;
type CatalogPackage = Pick<
  MaintenancePackage,
  "id" | "name" | "adjustments" | "pages" | "valueCents"
>;

/** Gestão dos planos de manutenção da empresa (pool compartilhado por projeto). */
export function CompanyPlanSection({
  companyId,
  instances,
  companyProjects,
  plans,
  packages,
}: {
  companyId: string;
  instances: ProjectPlanBalance[];
  companyProjects: { id: string; name: string }[];
  plans: CatalogPlan[];
  packages: CatalogPackage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activating, setActivating] = useState(false);
  const [editingCoverage, setEditingCoverage] = useState<ProjectPlanBalance | null>(null);
  const [cancelling, setCancelling] = useState<ProjectPlanBalance | null>(null);

  const active = instances.filter((i) => i.status !== "cancelled");
  const cancelled = instances.filter((i) => i.status === "cancelled");
  const coveredIds = new Set(
    active.flatMap((i) => i.coveredProjects.map((p) => p.id)),
  );
  const availableForNew = companyProjects.filter((p) => !coveredIds.has(p.id));

  function run(
    action: () => Promise<{ success: true; id?: string } | { error: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planos de manutenção</CardTitle>
        <CardDescription>
          Cotas mensais de demandas (ajustes e páginas novas) compartilhadas
          entre os projetos cobertos da empresa.
        </CardDescription>
        {plans.length > 0 && availableForNew.length > 0 && (
          <CardAction>
            <Button size="sm" onClick={() => setActivating(true)}>
              <Plus />
              Ativar plano
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {active.length === 0 && cancelled.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {plans.length === 0
              ? "Nenhum plano ativo no catálogo — cadastre em Financeiro → Serviços."
              : "Nenhum plano de manutenção para esta empresa ainda."}
          </p>
        )}

        {active.map((instance) => (
          <section
            key={instance.projectPlanId}
            className="space-y-4 rounded-xl p-4 ring-1 ring-border"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <p className="text-sm font-semibold">{instance.plan.name}</p>
              <span className="text-xs text-muted-foreground">
                ciclo {formatDate(instance.periodStart)} →{" "}
                {formatDate(instance.periodEnd)}
              </span>
              <span className="chip">
                {billingModeLabels[instance.billingMode] ?? instance.billingMode}
              </span>
              {instance.status === "pending_payment" && (
                <span className="chip border-amber-400/30 bg-amber-400/10 text-amber-300">
                  Aguardando pagamento
                </span>
              )}
              <span className="chip ml-auto">
                {formatCurrency(instance.plan.valueCents)}/mês
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              Cobre {instance.coveredProjects.length}{" "}
              {instance.coveredProjects.length === 1 ? "projeto" : "projetos"}:{" "}
              {instance.coveredProjects.map((p) => p.name).join(", ")}
              {instance.status !== "pending_payment" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Editar cobertura"
                  disabled={pending}
                  onClick={() => setEditingCoverage(instance)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <QuotaRow
                label="Ajustes no ciclo"
                used={instance.monthly.adjustment.used}
                limit={instance.monthly.adjustment.limit}
                credits={instance.packageCredits.adjustment}
              />
              <QuotaRow
                label="Páginas novas no ciclo"
                used={instance.monthly.page.used}
                limit={instance.monthly.page.limit}
                credits={instance.packageCredits.page}
              />
            </div>

            {instance.usageByProject.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Consumo no ciclo por projeto
                </p>
                <ul className="space-y-1 text-sm">
                  {instance.usageByProject.map((u) => (
                    <li key={u.projectId} className="flex items-center justify-between">
                      <span className="truncate text-muted-foreground">{u.name}</span>
                      <span className="tabular-nums">
                        {u.adjustment} ajustes · {u.page} páginas
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {instance.packages.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  Pacotes extras
                </p>
                <ul className="space-y-1.5">
                  {instance.packages.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm ring-1 ring-border"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {p.name}
                      </span>
                      {p.status === "active" && (
                        <span className="text-xs text-muted-foreground">
                          restam {p.adjustmentsLeft} ajustes · {p.pagesLeft}{" "}
                          páginas
                        </span>
                      )}
                      <span className={`chip ${p.status === "cancelled" ? "opacity-60" : ""}`}>
                        {packageStatusLabels[p.status] ?? p.status}
                      </span>
                      {p.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Cancelar ${p.name}`}
                          className="text-muted-foreground hover:text-destructive"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => cancelProjectPlanPackage(p.id),
                              "Pacote cancelado.",
                            )
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {instance.status === "pending_payment" && (
                <span className="text-xs text-amber-300">
                  Aguardando pagamento — alterações no plano bloqueadas até a
                  quitação.
                </span>
              )}

              {plans.length > 1 && instance.status !== "pending_payment" && (
                <Select
                  value=""
                  onValueChange={(value) =>
                    value &&
                    run(
                      () =>
                        changeCompanyPlan({
                          projectPlanId: instance.projectPlanId,
                          planId: value,
                        }),
                      "Plano atualizado.",
                    )
                  }
                >
                  <SelectTrigger className="w-44" aria-label="Trocar plano">
                    <SelectValue placeholder="Trocar plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans
                      .filter((p) => p.id !== instance.plan.id)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {packages.length > 0 && instance.status !== "pending_payment" && (
                <Select
                  value=""
                  onValueChange={(value) =>
                    value &&
                    run(
                      () =>
                        addPackageToPlan({
                          projectPlanId: instance.projectPlanId,
                          packageId: value,
                        }),
                      "Pacote adicionado (sem cobrança).",
                    )
                  }
                >
                  <SelectTrigger className="w-56" aria-label="Adicionar pacote">
                    <SelectValue placeholder="Adicionar pacote (sem cobrança)" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} (+{p.adjustments} ajustes · +{p.pages} páginas)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                variant="ghost"
                className="ml-auto text-muted-foreground hover:text-destructive"
                disabled={pending}
                onClick={() => setCancelling(instance)}
              >
                Cancelar plano
              </Button>
            </div>
          </section>
        ))}

        {cancelled.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Planos cancelados
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {cancelled.map((i) => (
                <li key={i.projectPlanId}>
                  {i.plan.name} — cobria{" "}
                  {i.coveredProjects.map((p) => p.name).join(", ") || "—"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {activating && (
        <PlanFormDialog
          title="Ativar plano de manutenção"
          description="A cota é um pool único compartilhado entre todos os projetos selecionados."
          plans={plans}
          projects={availableForNew}
          pending={pending}
          onClose={() => setActivating(false)}
          onSubmit={(planId, projectIds) =>
            run(
              () => activateCompanyPlan({ companyId, planId, projectIds }),
              "Plano ativado.",
            )
          }
        />
      )}

      {editingCoverage && (
        <PlanFormDialog
          title={`Cobertura — ${editingCoverage.plan.name}`}
          description="Selecione os projetos da empresa cobertos por este plano."
          plans={null}
          projects={companyProjects.filter(
            (p) =>
              !coveredIds.has(p.id) ||
              editingCoverage.coveredProjects.some((c) => c.id === p.id),
          )}
          initialSelected={editingCoverage.coveredProjects.map((p) => p.id)}
          pending={pending}
          onClose={() => setEditingCoverage(null)}
          onSubmit={(_, projectIds) =>
            run(
              () =>
                updateCompanyPlanCoverage({
                  projectPlanId: editingCoverage.projectPlanId,
                  projectIds,
                }),
              "Cobertura atualizada.",
            )
          }
        />
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title="Cancelar plano de manutenção"
        description={
          cancelling
            ? `Cancela o plano "${cancelling.plan.name}" da empresa. Os projetos cobertos voltam a aceitar demandas sem controle de cota. O histórico é mantido.`
            : ""
        }
        confirmLabel="Cancelar plano"
        onConfirm={async () => {
          if (!cancelling) return null;
          const result = await cancelCompanyPlan(cancelling.projectPlanId);
          if ("error" in result) return result.error;
          toast.success("Plano cancelado.");
          router.refresh();
          return null;
        }}
      />
    </Card>
  );
}

/** Dialog de seleção de plano (opcional) + projetos cobertos (checkboxes). */
function PlanFormDialog({
  title,
  description,
  plans,
  projects,
  initialSelected = [],
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  plans: CatalogPlan[] | null;
  projects: { id: string; name: string }[];
  initialSelected?: string[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (planId: string, projectIds: string[]) => void;
}) {
  const [planId, setPlanId] = useState("");
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [error, setError] = useState<string | null>(null);

  const valid = (plans === null || planId) && selected.length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {plans !== null && (
            <Select value={planId} onValueChange={(v) => setPlanId(v ?? "")}>
              <SelectTrigger className="w-full" aria-label="Selecionar plano">
                <SelectValue placeholder="Selecione o plano">
                  {(value: string | null) =>
                    !value
                      ? "Selecione o plano"
                      : (plans.find((p) => p.id === value)?.name ??
                        "Selecione o plano")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.adjustmentsLimit} ajustes · {p.pagesLimit}{" "}
                    páginas/mês)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Projetos cobertos *</p>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum projeto disponível da empresa.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {projects.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ring-1 ring-border">
                      <Checkbox
                        checked={selected.includes(p.id)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked
                              ? [...prev, p.id]
                              : prev.filter((id) => id !== p.id),
                          )
                        }
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
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
          <Button
            disabled={!valid || pending}
            onClick={() => {
              if (!valid) {
                setError("Selecione o plano e ao menos 1 projeto.");
                return;
              }
              onSubmit(planId, selected);
              onClose();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
