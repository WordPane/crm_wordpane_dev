import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PortalDemandForm } from "@/components/portal/portal-demand-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import {
  computeProjectPlanBalance,
  getPlanIdCoveringProject,
  type ProjectPlanBalance,
} from "@/lib/queries/maintenance";
import { listPortalProjects } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "Nova demanda" };

export default async function PortalNewDemandPage() {
  const user = await requireUser();
  const projects = await listPortalProjects(user);
  const brand = await getBranding();

  // Saldo do plano de manutenção por projeto (projetos sem plano ficam fora).
  // Projetos cobertos pela MESMA instância compartilham o pool — cache por
  // instância no escopo do request para não recalcular o mesmo saldo.
  const balanceByInstance = new Map<string, Promise<ProjectPlanBalance | null>>();
  const balances = await Promise.all(
    projects.map(async (p) => {
      const instanceId = await getPlanIdCoveringProject(p.id);
      if (!instanceId) return null;
      let balance = balanceByInstance.get(instanceId);
      if (!balance) {
        balance = computeProjectPlanBalance(p.id);
        balanceByInstance.set(instanceId, balance);
      }
      return balance;
    }),
  );
  const plans = Object.fromEntries(
    projects.flatMap((p, i) => {
      const b = balances[i];
      if (!b) return [];
      return [
        [
          p.id,
          {
            planName: b.plan.name,
            adjustmentsLeft: b.available.adjustment,
            pagesLeft: b.available.page,
            pendingPayment: b.status === "pending_payment",
          },
        ],
      ];
    }),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/portal/demandas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para demandas
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold">Nova demanda</h1>
          <p className="text-sm text-muted-foreground">
            Conte o que você precisa — a equipe analisa e dá andamento por aqui.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da demanda</CardTitle>
          <CardDescription>
            Campos marcados com * são obrigatórios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
              Sua empresa ainda não tem projetos cadastrados. Fale com a equipe
              {brand.appName} para criar um projeto antes de enviar demandas.
            </p>
          ) : (
            <PortalDemandForm
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
              plans={plans}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
