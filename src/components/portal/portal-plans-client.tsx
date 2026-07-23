"use client";

import { Loader2, ShieldCheck, ShoppingCart, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { QuotaRow } from "@/components/maintenance/quota-row";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import type { MaintenancePlan } from "@/lib/db/schema";
import type { ProjectPlanBalance } from "@/lib/queries/maintenance";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { cancelOwnPlanInstance, subscribeToPlan } from "@/server/actions/maintenance";

const billingModeLabels: Record<string, string> = {
  manual: "Manual",
  one_time: "Mensal avulso",
  recurring: "Assinatura recorrente",
};

type CatalogPlan = Pick<
  MaintenancePlan,
  "id" | "name" | "description" | "adjustmentsLimit" | "pagesLimit" | "valueCents"
>;

/** Página "Manutenção" do portal: planos contratados + contratação self-service. */
export function PortalPlansClient({
  instances,
  catalogPlans,
  companyProjects,
}: {
  instances: ProjectPlanBalance[];
  catalogPlans: CatalogPlan[];
  companyProjects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [subscribing, setSubscribing] = useState<CatalogPlan | null>(null);
  const [cancelling, setCancelling] = useState<ProjectPlanBalance | null>(null);

  const active = instances.filter((i) => i.status !== "cancelled");
  const cancelled = instances.filter((i) => i.status === "cancelled");
  const coveredIds = new Set(
    active.flatMap((i) => i.coveredProjects.map((p) => p.id)),
  );
  const availableProjects = companyProjects.filter((p) => !coveredIds.has(p.id));

  return (
    <div className="space-y-6">
      {active.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldCheck className="size-10 text-muted-foreground/40" />
            <p className="font-medium">Nenhum plano de manutenção contratado</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Com o plano, sua equipe pode pedir ajustes, correções e páginas
              novas para os seus sites todos os meses, acompanhando o saldo
              por aqui.
            </p>
          </CardContent>
        </Card>
      )}

      {active.map((instance) => (
        <Card key={instance.projectPlanId}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="size-4" />
              {instance.plan.name}
              <span className="chip">
                {billingModeLabels[instance.billingMode] ?? instance.billingMode}
              </span>
              {instance.status === "pending_payment" && (
                <span className="chip border-amber-400/30 bg-amber-400/10 text-amber-300">
                  Aguardando pagamento
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Ciclo atual: {formatDate(instance.periodStart)} →{" "}
              {formatDate(instance.periodEnd)} ·{" "}
              {formatCurrency(instance.plan.valueCents)}/mês
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              Cobre {instance.coveredProjects.length}{" "}
              {instance.coveredProjects.length === 1 ? "projeto" : "projetos"}:{" "}
              {instance.coveredProjects.map((p) => p.name).join(", ")}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <QuotaRow
                label="Ajustes, correções e atualizações"
                used={instance.monthly.adjustment.used}
                limit={instance.monthly.adjustment.limit}
                credits={instance.packageCredits.adjustment}
              />
              <QuotaRow
                label="Páginas novas"
                used={instance.monthly.page.used}
                limit={instance.monthly.page.limit}
                credits={instance.packageCredits.page}
              />
            </div>

            {instance.status === "pending_payment" && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
                <span className="flex-1">
                  Plano aguardando pagamento do ciclo — as demandas ficam
                  bloqueadas até a quitação.
                </span>
                <Button
                  size="sm"
                  render={<Link href="/portal/financeiro" />}
                >
                  <ShoppingCart />
                  Pagar agora
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-300 hover:text-destructive"
                  onClick={() => setCancelling(instance)}
                >
                  Cancelar contratação
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {cancelled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Planos cancelados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {cancelled.map((i) => (
                <li key={i.projectPlanId}>
                  {i.plan.name} — cobria{" "}
                  {i.coveredProjects.map((p) => p.name).join(", ") || "—"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {catalogPlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contratar plano de manutenção</CardTitle>
            <CardDescription>
              Escolha o plano, os projetos cobertos e a forma de pagamento. A
              cota é compartilhada entre todos os projetos escolhidos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {catalogPlans.map((plan) => (
                <li
                  key={plan.id}
                  className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-border"
                >
                  <div>
                    <p className="text-sm font-semibold">{plan.name}</p>
                    {plan.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {plan.description}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.adjustmentsLimit} ajustes/mês · {plan.pagesLimit}{" "}
                    páginas/mês
                  </p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-sm font-bold">
                      {formatCurrency(plan.valueCents)}
                      <span className="text-xs font-normal text-muted-foreground">
                        /mês
                      </span>
                    </span>
                    <Button
                      size="sm"
                      disabled={availableProjects.length === 0}
                      onClick={() => setSubscribing(plan)}
                    >
                      Contratar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {availableProjects.length === 0 && companyProjects.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Todos os seus projetos já estão cobertos por um plano.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {subscribing && (
        <SubscribeDialog
          plan={subscribing}
          projects={availableProjects}
          onClose={() => setSubscribing(null)}
          onDone={() => {
            setSubscribing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title="Cancelar contratação"
        description={
          cancelling
            ? `Cancela a contratação do plano "${cancelling.plan.name}" e a cobrança pendente no Financeiro. Os projetos voltam a ficar sem plano até uma nova contratação.`
            : ""
        }
        confirmLabel="Cancelar contratação"
        onConfirm={async () => {
          if (!cancelling) return null;
          const result = await cancelOwnPlanInstance(cancelling.projectPlanId);
          if ("error" in result) return result.error;
          toast.success("Contratação cancelada.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

function SubscribeDialog({
  plan,
  projects,
  onClose,
  onDone,
}: {
  plan: CatalogPlan;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(projects.map((p) => p.id));
  const [billingMode, setBillingMode] = useState<"one_time" | "recurring">(
    "recurring",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await subscribeToPlan({
        planId: plan.id,
        projectIds: selected,
        billingMode,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(
        billingMode === "one_time"
          ? "Plano criado! Quite a fatura do ciclo no Financeiro para ativar."
          : "Assinatura criada! Quite a primeira cobrança no Financeiro para ativar.",
      );
      onDone();
      router.push("/portal/financeiro");
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contratar {plan.name}</DialogTitle>
          <DialogDescription>
            {plan.adjustmentsLimit} ajustes/mês · {plan.pagesLimit} páginas/mês
            · {formatCurrency(plan.valueCents)}/mês
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Projetos cobertos *</p>
            <ul className="max-h-44 space-y-1.5 overflow-y-auto">
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
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Forma de pagamento *</p>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-border">
                <input
                  type="radio"
                  name="billingMode"
                  className="mt-1"
                  checked={billingMode === "recurring"}
                  onChange={() => setBillingMode("recurring")}
                />
                <span>
                  <span className="block font-medium">
                    Assinatura recorrente
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Cobrança automática todo mês, sem precisar refazer o
                    pagamento.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-border">
                <input
                  type="radio"
                  name="billingMode"
                  className="mt-1"
                  checked={billingMode === "one_time"}
                  onChange={() => setBillingMode("one_time")}
                />
                <span>
                  <span className="block font-medium">Mensal avulso</span>
                  <span className="text-xs text-muted-foreground">
                    Uma fatura por mês — você paga cada ciclo manualmente no
                    Financeiro.
                  </span>
                </span>
              </label>
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
          <Button disabled={selected.length === 0 || pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />}
            Contratar por {formatCurrency(plan.valueCents)}/mês
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
