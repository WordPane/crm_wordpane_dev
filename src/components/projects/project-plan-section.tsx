"use client";

import { ArrowRight, Loader2, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import type { MaintenancePlan } from "@/lib/db/schema";
import type { ProjectPlanBalance } from "@/lib/queries/maintenance";
import { formatDate } from "@/lib/utils/format";
import { activateCompanyPlan } from "@/server/actions/maintenance";

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

/**
 * Seção do plano de manutenção na página do projeto: visão do pool
 * (compartilhado entre os projetos cobertos). A gestão é centralizada na
 * página do cliente (aba Manutenção).
 */
export function ProjectPlanSection({
  projectId,
  companyId,
  balance,
  plans,
}: {
  projectId: string;
  companyId: string;
  balance: ProjectPlanBalance | null;
  plans: Pick<
    MaintenancePlan,
    "id" | "name" | "adjustmentsLimit" | "pagesLimit"
  >[];
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState("");
  const [pending, startTransition] = useTransition();

  function activate() {
    startTransition(async () => {
      const result = await activateCompanyPlan({
        companyId,
        planId,
        projectIds: [projectId],
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Plano ativado para este projeto.");
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
              Nenhum plano ativo no catálogo — cadastre em Financeiro →
              Serviços.
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
              <Button disabled={!planId || pending} onClick={activate}>
                {pending && <Loader2 className="animate-spin" />}
                <ShieldCheck />
                Ativar plano
              </Button>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Para cobrir vários projetos da empresa com o mesmo pool de cotas,
            use a aba Manutenção na página do cliente.
          </p>
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
        {balance.shared && (
          <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Users className="size-4 shrink-0 text-primary" />
            Cota compartilhada com {balance.coveredProjects.length} projetos da
            empresa:{" "}
            {balance.coveredProjects.map((p) => p.name).join(", ")}.
          </p>
        )}

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

        {balance.usageByProject.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Consumo no ciclo por projeto
            </p>
            <ul className="space-y-1 text-sm">
              {balance.usageByProject.map((u) => (
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

        <p className="border-t border-border pt-3 text-sm">
          <Link
            href={`/admin/clientes/${companyId}?tab=manutencao`}
            className="inline-flex items-center gap-1.5 text-primary transition-colors hover:text-foreground"
          >
            Gerenciar plano, cobertura e pacotes na página do cliente
            <ArrowRight className="size-3.5" />
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
