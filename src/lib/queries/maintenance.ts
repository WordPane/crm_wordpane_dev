import { addMonths, format, parseISO } from "date-fns";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { requireTeam, type SessionUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  maintenancePackages,
  maintenancePlans,
  projectPlanPackages,
  projectPlanUsages,
  projectPlans,
  type Demand,
  type MaintenancePackage,
  type MaintenancePlan,
  type ProjectPlan,
} from "@/lib/db/schema";
import { businessToday } from "@/lib/utils/format";
import type { UsageKind } from "@/lib/validations/maintenance";

/** Categoria da demanda → cota consumida ("nova_pagina" = página; resto = ajuste). */
export function usageKindForCategory(category: Demand["category"]): UsageKind {
  return category === "nova_pagina" ? "page" : "adjustment";
}

export const usageKindLabels: Record<UsageKind, string> = {
  adjustment: "ajustes",
  page: "páginas",
};

// ─────────────────────────── Saldo / ciclo ───────────────────────────

export type QuotaUsage = { used: number; limit: number };

export type PackageBalance = {
  id: string;
  name: string;
  status: string;
  adjustmentsTotal: number;
  pagesTotal: number;
  adjustmentsLeft: number;
  pagesLeft: number;
  createdAt: Date;
};

export type ProjectPlanBalance = {
  projectPlanId: string;
  projectId: string;
  plan: Pick<
    MaintenancePlan,
    "id" | "name" | "adjustmentsLimit" | "pagesLimit" | "valueCents"
  >;
  /** Ciclo mensal corrente [periodStart, periodEnd). */
  periodStart: string;
  periodEnd: string;
  monthly: { adjustment: QuotaUsage; page: QuotaUsage };
  /** Pacotes comprados (qualquer status; só `active` gera crédito). */
  packages: PackageBalance[];
  /** Créditos restantes somados dos pacotes ativos. */
  packageCredits: { adjustment: number; page: number };
  /** Disponível agora: mensal restante + créditos de pacotes. */
  available: { adjustment: number; page: number };
};

type PlanRow = { projectPlan: ProjectPlan; plan: MaintenancePlan };

function nextPeriodStart(periodStart: string): string {
  return format(addMonths(parseISO(periodStart), 1), "yyyy-MM-dd");
}

/**
 * Avança o ciclo mensal até conter hoje (rollover preguiçoso: sem cron, o
 * ciclo vira na primeira leitura depois do fechamento) e persiste se mudou.
 */
async function applyRollover(row: PlanRow): Promise<string> {
  const today = businessToday();
  let start = row.projectPlan.currentPeriodStart;
  let changed = false;
  while (nextPeriodStart(start) <= today) {
    start = nextPeriodStart(start);
    changed = true;
  }
  if (changed) {
    await db
      .update(projectPlans)
      .set({ currentPeriodStart: start, updatedAt: new Date() })
      .where(eq(projectPlans.id, row.projectPlan.id));
  }
  return start;
}

/** Plano ativo do projeto (com rollover aplicado) ou null. */
async function loadActivePlan(projectId: string): Promise<PlanRow | null> {
  const [row] = await db
    .select({ projectPlan: projectPlans, plan: maintenancePlans })
    .from(projectPlans)
    .innerJoin(maintenancePlans, eq(projectPlans.planId, maintenancePlans.id))
    .where(eq(projectPlans.projectId, projectId))
    .limit(1);
  if (!row || row.projectPlan.status !== "active") return null;
  const start = await applyRollover(row);
  if (start !== row.projectPlan.currentPeriodStart) {
    row.projectPlan.currentPeriodStart = start;
  }
  return row;
}

type CountRow = { kind: string; packageId: string | null; count: number };

async function countUsages(projectPlanId: string): Promise<CountRow[]> {
  return db
    .select({
      kind: projectPlanUsages.kind,
      packageId: projectPlanUsages.packageId,
      count: sql<number>`count(*)::int`,
    })
    .from(projectPlanUsages)
    .where(
      and(
        eq(projectPlanUsages.projectPlanId, projectPlanId),
        isNull(projectPlanUsages.releasedAt),
      ),
    )
    .groupBy(projectPlanUsages.kind, projectPlanUsages.packageId);
}

/** Saldo do plano do projeto sem guarda de acesso (uso interno/admin/portal). */
export async function computeProjectPlanBalance(
  projectId: string,
): Promise<ProjectPlanBalance | null> {
  const row = await loadActivePlan(projectId);
  if (!row) return null;

  const periodStart = row.projectPlan.currentPeriodStart;
  const periodEnd = nextPeriodStart(periodStart);

  const [counts, packageRows] = await Promise.all([
    countUsages(row.projectPlan.id),
    db
      .select()
      .from(projectPlanPackages)
      .where(eq(projectPlanPackages.projectPlanId, row.projectPlan.id))
      .orderBy(asc(projectPlanPackages.createdAt)),
  ]);

  // Consumo mensal: linhas sem pacote DENTRO do ciclo corrente. Linhas de
  // ciclos passados não contam mais (a cota renovou).
  const cycleCounts = await db
    .select({
      kind: projectPlanUsages.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(projectPlanUsages)
    .where(
      and(
        eq(projectPlanUsages.projectPlanId, row.projectPlan.id),
        isNull(projectPlanUsages.releasedAt),
        isNull(projectPlanUsages.packageId),
        sql`(${projectPlanUsages.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date >= ${periodStart}::date`,
        sql`(${projectPlanUsages.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date < ${periodEnd}::date`,
      ),
    )
    .groupBy(projectPlanUsages.kind);

  const monthlyUsed = { adjustment: 0, page: 0 };
  for (const c of cycleCounts) {
    if (c.kind === "adjustment") monthlyUsed.adjustment = c.count;
    else if (c.kind === "page") monthlyUsed.page = c.count;
  }

  // Consumo por pacote (créditos persistem entre ciclos até esgotar)
  const usedByPackage = new Map<string, { adjustment: number; page: number }>();
  for (const c of counts) {
    if (!c.packageId) continue;
    const entry = usedByPackage.get(c.packageId) ?? { adjustment: 0, page: 0 };
    if (c.kind === "adjustment") entry.adjustment += c.count;
    else if (c.kind === "page") entry.page += c.count;
    usedByPackage.set(c.packageId, entry);
  }

  const packages: PackageBalance[] = packageRows.map((p) => {
    const used = usedByPackage.get(p.id) ?? { adjustment: 0, page: 0 };
    const grants = p.status === "active";
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      adjustmentsTotal: p.adjustments,
      pagesTotal: p.pages,
      adjustmentsLeft: grants ? Math.max(p.adjustments - used.adjustment, 0) : 0,
      pagesLeft: grants ? Math.max(p.pages - used.page, 0) : 0,
      createdAt: p.createdAt,
    };
  });

  const packageCredits = {
    adjustment: packages.reduce((sum, p) => sum + p.adjustmentsLeft, 0),
    page: packages.reduce((sum, p) => sum + p.pagesLeft, 0),
  };

  const monthlyLeft = {
    adjustment: Math.max(row.plan.adjustmentsLimit - monthlyUsed.adjustment, 0),
    page: Math.max(row.plan.pagesLimit - monthlyUsed.page, 0),
  };

  return {
    projectPlanId: row.projectPlan.id,
    projectId: row.projectPlan.projectId,
    plan: {
      id: row.plan.id,
      name: row.plan.name,
      adjustmentsLimit: row.plan.adjustmentsLimit,
      pagesLimit: row.plan.pagesLimit,
      valueCents: row.plan.valueCents,
    },
    periodStart,
    periodEnd,
    monthly: {
      adjustment: {
        used: monthlyUsed.adjustment,
        limit: row.plan.adjustmentsLimit,
      },
      page: { used: monthlyUsed.page, limit: row.plan.pagesLimit },
    },
    packages,
    packageCredits,
    available: {
      adjustment: monthlyLeft.adjustment + packageCredits.adjustment,
      page: monthlyLeft.page + packageCredits.page,
    },
  };
}

/** Saldo do plano do projeto para a equipe (admin). */
export async function getProjectPlanBalance(
  user: SessionUser,
  projectId: string,
): Promise<ProjectPlanBalance | null> {
  requireTeam(user);
  return computeProjectPlanBalance(projectId);
}

/** Erro de cota esgotada — traduzido em mensagem amigável na action. */
export class QuotaExceededError extends Error {
  constructor(public readonly kind: UsageKind) {
    super(`Limite de ${usageKindLabels[kind]} do plano atingido.`);
  }
}

/** Mensagem amigável de cota esgotada (portal e admin). */
export function quotaExceededMessage(kind: UsageKind): string {
  return `Limite de ${usageKindLabels[kind]} do plano de manutenção atingido neste ciclo. Adquira um pacote extra para continuar enviando demandas.`;
}

/**
 * Consome 1 cota (`kind`) para a demanda: primeiro a mensal do ciclo; se
 * esgotada, o pacote ativo mais antigo com crédito (FIFO). Retorna false
 * quando não há saldo — o chamador deve abortar a criação da demanda.
 * Deve rodar DENTRO da transação de criação da demanda.
 */
export async function allocateQuota(
  tx: Pick<typeof db, "insert">,
  projectId: string,
  kind: UsageKind,
  demandId: string,
): Promise<boolean> {
  const balance = await computeProjectPlanBalance(projectId);
  if (!balance) return true; // sem plano → sem controle

  if (balance.available[kind] <= 0) return false;

  const monthlyLeft =
    balance.monthly[kind].limit - balance.monthly[kind].used;
  let packageId: string | null = null;
  if (monthlyLeft <= 0) {
    const pkg = balance.packages.find(
      (p) =>
        p.status === "active" &&
        (kind === "adjustment" ? p.adjustmentsLeft > 0 : p.pagesLeft > 0),
    );
    if (!pkg) return false;
    packageId = pkg.id;
  }

  await tx.insert(projectPlanUsages).values({
    projectPlanId: balance.projectPlanId,
    demandId,
    packageId,
    kind,
  });
  return true;
}

/**
 * Estorna a cota consumida por uma demanda (recusa, exclusão ou saída do
 * projeto). Idempotente.
 */
export async function releaseQuotaForDemand(demandId: string): Promise<void> {
  await db
    .update(projectPlanUsages)
    .set({ releasedAt: new Date() })
    .where(
      and(
        eq(projectPlanUsages.demandId, demandId),
        isNull(projectPlanUsages.releasedAt),
      ),
    );
}

/** Atualiza o tipo de cota da demanda quando a categoria muda (super_admin). */
export async function updateQuotaKindForDemand(
  demandId: string,
  kind: UsageKind,
): Promise<void> {
  await db
    .update(projectPlanUsages)
    .set({ kind })
    .where(
      and(
        eq(projectPlanUsages.demandId, demandId),
        isNull(projectPlanUsages.releasedAt),
      ),
    );
}

// ─────────────────────────── Catálogo ───────────────────────────

export async function listMaintenancePlans(
  user: SessionUser,
): Promise<MaintenancePlan[]> {
  requireTeam(user);
  return db
    .select()
    .from(maintenancePlans)
    .orderBy(asc(maintenancePlans.valueCents), asc(maintenancePlans.name));
}

export async function listMaintenancePackages(
  user: SessionUser,
): Promise<MaintenancePackage[]> {
  requireTeam(user);
  return db
    .select()
    .from(maintenancePackages)
    .orderBy(asc(maintenancePackages.valueCents), asc(maintenancePackages.name));
}

/** Pacotes ativos do catálogo para o portal (compra pelo cliente). */
export async function listActiveMaintenancePackages(): Promise<
  MaintenancePackage[]
> {
  return db
    .select()
    .from(maintenancePackages)
    .where(eq(maintenancePackages.active, true))
    .orderBy(asc(maintenancePackages.valueCents), asc(maintenancePackages.name));
}

/** Planos ativos do catálogo (selects de ativação no admin). */
export async function listActiveMaintenancePlans(
  user: SessionUser,
): Promise<MaintenancePlan[]> {
  requireTeam(user);
  return db
    .select()
    .from(maintenancePlans)
    .where(eq(maintenancePlans.active, true))
    .orderBy(asc(maintenancePlans.valueCents), asc(maintenancePlans.name));
}
