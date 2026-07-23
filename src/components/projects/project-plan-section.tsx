"use client";

import { Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  MaintenancePackage,
  MaintenancePlan,
} from "@/lib/db/schema";
import type { ProjectPlanBalance } from "@/lib/queries/maintenance";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import {
  activateProjectPlan,
  addPackageToProject,
  cancelProjectPlan,
  cancelProjectPlanPackage,
} from "@/server/actions/maintenance";

const packageStatusLabels: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  active: "Ativo",
  cancelled: "Cancelado",
};

/** Linha de cota com barra de progresso (usado/limite). */
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
  const pct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : used > 0 ? 100 : 0;
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

/** Seção do plano de manutenção do projeto: cota mensal, pacotes e gestão. */
export function ProjectPlanSection({
  projectId,
  balance,
  plans,
  packages,
}: {
  projectId: string;
  balance: ProjectPlanBalance | null;
  plans: Pick<MaintenancePlan, "id" | "name" | "adjustmentsLimit" | "pagesLimit">[];
  packages: Pick<
    MaintenancePackage,
    "id" | "name" | "adjustments" | "pages" | "valueCents"
  >[];
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [cancellingPlan, setCancellingPlan] = useState(false);
  const [pending, startTransition] = useTransition();

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

  if (!balance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Plano de manutenção</CardTitle>
          <CardDescription>
            Controle a quantidade de demandas (ajustes e páginas novas) que o
            cliente pode solicitar neste projeto por mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum plano ativo no catálogo — cadastre em Configurações →
              Planos de manutenção.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Select value={planId} onValueChange={(v) => setPlanId(v ?? "")}>
                <SelectTrigger className="w-72" aria-label="Selecionar plano">
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
              <Button
                disabled={!planId || pending}
                onClick={() =>
                  run(
                    () => activateProjectPlan({ projectId, planId }),
                    "Plano ativado no projeto.",
                  )
                }
              >
                {pending && <Loader2 className="animate-spin" />}
                <ShieldCheck />
                Ativar plano
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plano de manutenção — {balance.plan.name}</CardTitle>
        <CardDescription>
          Ciclo atual: {formatDate(balance.periodStart)} →{" "}
          {formatDate(balance.periodEnd)} (renova mensalmente)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <QuotaRow
            label="Ajustes no ciclo"
            used={balance.monthly.adjustment.used}
            limit={balance.monthly.adjustment.limit}
            credits={balance.packageCredits.adjustment}
          />
          <QuotaRow
            label="Páginas novas no ciclo"
            used={balance.monthly.page.used}
            limit={balance.monthly.page.limit}
            credits={balance.packageCredits.page}
          />
        </div>

        {balance.packages.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Pacotes extras
            </p>
            <ul className="space-y-1.5">
              {balance.packages.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm ring-1 ring-border"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {p.name}
                  </span>
                  {p.status === "active" && (
                    <span className="text-xs text-muted-foreground">
                      restam {p.adjustmentsLeft} ajustes · {p.pagesLeft} páginas
                    </span>
                  )}
                  <span
                    className={`chip ${p.status === "cancelled" ? "opacity-60" : ""}`}
                  >
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

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {packages.length > 0 && (
            <>
              <Select value={packageId} onValueChange={(v) => setPackageId(v ?? "")}>
                <SelectTrigger className="w-64" aria-label="Selecionar pacote">
                  <SelectValue placeholder="Adicionar pacote">
                    {(value: string | null) =>
                      !value
                        ? "Adicionar pacote"
                        : (packages.find((p) => p.id === value)?.name ??
                          "Adicionar pacote")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (+{p.adjustments} ajustes · +{p.pages} páginas ·{" "}
                      {formatCurrency(p.valueCents)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!packageId || pending}
                onClick={() =>
                  run(
                    () => addPackageToProject({ projectId, packageId }),
                    "Pacote adicionado ao projeto.",
                  )
                }
              >
                <Plus />
                Adicionar (sem cobrança)
              </Button>
            </>
          )}

          {plans.length > 1 && (
            <Select
              value=""
              onValueChange={(value) =>
                run(
                  () => activateProjectPlan({ projectId, planId: value }),
                  "Plano do projeto atualizado.",
                )
              }
            >
              <SelectTrigger className="w-48" aria-label="Trocar plano">
                <SelectValue placeholder="Trocar plano" />
              </SelectTrigger>
              <SelectContent>
                {plans
                  .filter((p) => p.id !== balance.plan.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-destructive"
            disabled={pending}
            onClick={() => setCancellingPlan(true)}
          >
            Cancelar plano
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={cancellingPlan}
        onOpenChange={setCancellingPlan}
        title="Cancelar plano de manutenção"
        description={`Cancela o plano "${balance.plan.name}" deste projeto. O cliente volta a enviar demandas sem controle de cota. O histórico de consumo é mantido.`}
        confirmLabel="Cancelar plano"
        onConfirm={async () => {
          const result = await cancelProjectPlan(projectId);
          if ("error" in result) return result.error;
          toast.success("Plano cancelado.");
          router.refresh();
          return null;
        }}
      />
    </Card>
  );
}
