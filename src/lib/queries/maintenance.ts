import { addMonths, format, parseISO } from "date-fns";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { requireTeam, ForbiddenError, type SessionUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  maintenancePackages,
  maintenancePlans,
  projectPlanPackages,
  projectPlanProjects,
  projectPlanUsages,
  projectPlans,
  projects,
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

export type CoveredProject = { id: string; name: string };

export type ProjectUsage = {
  projectId: string;
  name: string;
  adjustment: number;
  page: number;
};

export type ProjectPlanBalance = {
  projectPlanId: string;
  companyId: string;
  /** Projeto que originou a consulta (null em listagens por empresa). */
  projectId: string | null;
  status: string;
  /** Forma de cobrança: manual | one_time (avulso) | recurring (assinatura). */
  billingMode: string;
  plan: Pick<
    MaintenancePlan,
    "id" | "name" | "adjustmentsLimit" | "pagesLimit" | "valueCents"
  >;
  /** Ciclo mensal corrente [periodStart, periodEnd). */
  periodStart: string;
  periodEnd: string;
  /** Projetos cobertos pelo plano (pool compartilhado). */
  coveredProjects: CoveredProject[];
  /** true quando a cota é compartilhada por mais de um projeto. */
  shared: boolean;
  monthly: { adjustment: QuotaUsage; page: QuotaUsage };
  /** Consumo do ciclo por projeto coberto (visão "uso por site"). */
  usageByProject: ProjectUsage[];
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
 * Avança o ciclo mensal e persiste se mudou. Plano avulso (one_time) ativo
 * avança UM ciclo e para no primeiro não pago (`pending_payment`) — nunca
 * pula ciclos: o cron fatura cada ciclo decorrido sequencialmente, após o
 * pagamento do anterior (ver /api/cron/planos-manutencao). Avulso já
 * `pending_payment` não avança: o ciclo corrente é o primeiro não pago.
 * Demais modos (manual/recurring) avançam até o ciclo que contém hoje.
 */
async function applyRollover(
  row: PlanRow,
  today: string = businessToday(),
): Promise<string> {
  let start = row.projectPlan.currentPeriodStart;
  if (nextPeriodStart(start) > today) return start;

  if (row.projectPlan.billingMode === "one_time") {
    // Já pendente: o ciclo corrente é o primeiro não pago — nada a avançar.
    if (row.projectPlan.status !== "active") return start;
    start = nextPeriodStart(start);
    await db
      .update(projectPlans)
      .set({
        currentPeriodStart: start,
        status: "pending_payment",
        updatedAt: new Date(),
      })
      .where(eq(projectPlans.id, row.projectPlan.id));
    row.projectPlan.status = "pending_payment";
    return start;
  }

  while (nextPeriodStart(start) <= today) {
    start = nextPeriodStart(start);
  }
  await db
    .update(projectPlans)
    .set({ currentPeriodStart: start, updatedAt: new Date() })
    .where(eq(projectPlans.id, row.projectPlan.id));
  return start;
}

/** Instância de plano vigente (active/pending_payment) que cobre o projeto,
 *  ou null. Canceladas não contam — o projeto volta a não ter controle.
 *  Rollover aplicado apenas em instâncias ativas. */
async function loadPlanForProject(projectId: string): Promise<PlanRow | null> {
  const [row] = await db
    .select({ projectPlan: projectPlans, plan: maintenancePlans })
    .from(projectPlanProjects)
    .innerJoin(
      projectPlans,
      eq(projectPlanProjects.projectPlanId, projectPlans.id),
    )
    .innerJoin(maintenancePlans, eq(projectPlans.planId, maintenancePlans.id))
    .where(
      and(
        eq(projectPlanProjects.projectId, projectId),
        inArray(projectPlans.status, ["active", "pending_payment"]),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.projectPlan.status === "active") {
    const start = await applyRollover(row);
    row.projectPlan.currentPeriodStart = start;
  }
  return row;
}

/**
 * Aplica o rollover em TODAS as instâncias avulsas (one_time) com ciclo
 * vencido (active ou pending_payment), sem depender de leituras de saldo —
 * o cron (/api/cron/planos-manutencao) a chama antes de faturar o ciclo.
 * Retorna quantas instâncias avançaram de ciclo (ficaram pending_payment).
 */
export async function applyDuePlanRollovers(today: string): Promise<number> {
  const rows = await db
    .select({ projectPlan: projectPlans, plan: maintenancePlans })
    .from(projectPlans)
    .innerJoin(maintenancePlans, eq(projectPlans.planId, maintenancePlans.id))
    .where(
      and(
        eq(projectPlans.billingMode, "one_time"),
        inArray(projectPlans.status, ["active", "pending_payment"]),
      ),
    );
  let applied = 0;
  for (const row of rows) {
    if (nextPeriodStart(row.projectPlan.currentPeriodStart) > today) continue;
    const start = await applyRollover(row, today);
    if (start !== row.projectPlan.currentPeriodStart) applied += 1;
  }
  return applied;
}

/** Id da instância vigente (active/pending_payment) que cobre o projeto
 *  (null = sem plano). Alinha com loadPlanForProject: inadimplente ainda
 *  cobre — mover a demanda entre projetos da mesma instância não estorna. */
export async function getPlanIdCoveringProject(
  projectId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: projectPlans.id })
    .from(projectPlanProjects)
    .innerJoin(
      projectPlans,
      eq(projectPlanProjects.projectPlanId, projectPlans.id),
    )
    .where(
      and(
        eq(projectPlanProjects.projectId, projectId),
        inArray(projectPlans.status, ["active", "pending_payment"]),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Monta o saldo completo de uma instância de plano. */
async function buildBalance(
  row: PlanRow,
  opts: { rollover: boolean; projectId: string | null },
): Promise<ProjectPlanBalance> {
  const periodStart = opts.rollover
    ? await applyRollover(row)
    : row.projectPlan.currentPeriodStart;
  const periodEnd = nextPeriodStart(periodStart);
  const planId = row.projectPlan.id;

  const [coverage, cycleCounts, packageCounts, perProjectCounts, packageRows] =
    await Promise.all([
      db
        .select({ id: projects.id, name: projects.name })
        .from(projectPlanProjects)
        .innerJoin(projects, eq(projectPlanProjects.projectId, projects.id))
        .where(eq(projectPlanProjects.projectPlanId, planId))
        .orderBy(asc(projects.name)),
      // Consumo mensal: sem pacote, dentro do ciclo corrente
      db
        .select({
          kind: projectPlanUsages.kind,
          count: sql<number>`count(*)::int`,
        })
        .from(projectPlanUsages)
        .where(
          and(
            eq(projectPlanUsages.projectPlanId, planId),
            isNull(projectPlanUsages.releasedAt),
            isNull(projectPlanUsages.packageId),
            sql`(${projectPlanUsages.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date >= ${periodStart}::date`,
            sql`(${projectPlanUsages.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date < ${periodEnd}::date`,
          ),
        )
        .groupBy(projectPlanUsages.kind),
      // Consumo por pacote (créditos persistem entre ciclos até esgotar)
      db
        .select({
          kind: projectPlanUsages.kind,
          packageId: projectPlanUsages.packageId,
          count: sql<number>`count(*)::int`,
        })
        .from(projectPlanUsages)
        .where(
          and(
            eq(projectPlanUsages.projectPlanId, planId),
            isNull(projectPlanUsages.releasedAt),
            isNotNull(projectPlanUsages.packageId),
          ),
        )
        .groupBy(projectPlanUsages.kind, projectPlanUsages.packageId),
      // Consumo do ciclo por projeto (qualquer origem: mensal ou pacote)
      db
        .select({
          projectId: projectPlanUsages.projectId,
          projectName: projects.name,
          kind: projectPlanUsages.kind,
          count: sql<number>`count(*)::int`,
        })
        .from(projectPlanUsages)
        .leftJoin(projects, eq(projectPlanUsages.projectId, projects.id))
        .where(
          and(
            eq(projectPlanUsages.projectPlanId, planId),
            isNull(projectPlanUsages.releasedAt),
            isNotNull(projectPlanUsages.projectId),
            sql`(${projectPlanUsages.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date >= ${periodStart}::date`,
            sql`(${projectPlanUsages.createdAt} AT TIME ZONE 'America/Sao_Paulo')::date < ${periodEnd}::date`,
          ),
        )
        .groupBy(projectPlanUsages.projectId, projects.name, projectPlanUsages.kind),
      db
        .select()
        .from(projectPlanPackages)
        .where(eq(projectPlanPackages.projectPlanId, planId))
        .orderBy(asc(projectPlanPackages.createdAt)),
    ]);

  const monthlyUsed = { adjustment: 0, page: 0 };
  for (const c of cycleCounts) {
    if (c.kind === "adjustment") monthlyUsed.adjustment = c.count;
    else if (c.kind === "page") monthlyUsed.page = c.count;
  }

  const usedByPackage = new Map<string, { adjustment: number; page: number }>();
  for (const c of packageCounts) {
    if (!c.packageId) continue;
    const entry = usedByPackage.get(c.packageId) ?? { adjustment: 0, page: 0 };
    if (c.kind === "adjustment") entry.adjustment += c.count;
    else if (c.kind === "page") entry.page += c.count;
    usedByPackage.set(c.packageId, entry);
  }

  const usageByProjectMap = new Map<string, ProjectUsage>();
  for (const c of perProjectCounts) {
    if (!c.projectId) continue;
    const entry = usageByProjectMap.get(c.projectId) ?? {
      projectId: c.projectId,
      name: c.projectName ?? "Projeto removido",
      adjustment: 0,
      page: 0,
    };
    if (c.kind === "adjustment") entry.adjustment += c.count;
    else if (c.kind === "page") entry.page += c.count;
    usageByProjectMap.set(c.projectId, entry);
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
    companyId: row.projectPlan.companyId,
    projectId: opts.projectId,
    status: row.projectPlan.status,
    billingMode: row.projectPlan.billingMode,
    plan: {
      id: row.plan.id,
      name: row.plan.name,
      adjustmentsLimit: row.plan.adjustmentsLimit,
      pagesLimit: row.plan.pagesLimit,
      valueCents: row.plan.valueCents,
    },
    periodStart,
    periodEnd,
    coveredProjects: coverage,
    shared: coverage.length > 1,
    monthly: {
      adjustment: {
        used: monthlyUsed.adjustment,
        limit: row.plan.adjustmentsLimit,
      },
      page: { used: monthlyUsed.page, limit: row.plan.pagesLimit },
    },
    usageByProject: [...usageByProjectMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    ),
    packages,
    packageCredits,
    available: {
      adjustment: monthlyLeft.adjustment + packageCredits.adjustment,
      page: monthlyLeft.page + packageCredits.page,
    },
  };
}

/** Saldo do plano que cobre o projeto, sem guarda (uso interno/admin/portal).
 *  Inclui instâncias `pending_payment` (UI mostra "aguardando pagamento"). */
export async function computeProjectPlanBalance(
  projectId: string,
): Promise<ProjectPlanBalance | null> {
  const row = await loadPlanForProject(projectId);
  if (!row) return null;
  return buildBalance(row, { rollover: false, projectId });
}

/** Saldo do plano do projeto para a equipe (admin). */
export async function getProjectPlanBalance(
  user: SessionUser,
  projectId: string,
): Promise<ProjectPlanBalance | null> {
  requireTeam(user);
  return computeProjectPlanBalance(projectId);
}

/** Instâncias de plano da empresa (ativas e canceladas) com saldo calculado. */
async function buildCompanyInstances(
  companyId: string,
): Promise<ProjectPlanBalance[]> {
  const rows = await db
    .select({ projectPlan: projectPlans, plan: maintenancePlans })
    .from(projectPlans)
    .innerJoin(maintenancePlans, eq(projectPlans.planId, maintenancePlans.id))
    .where(eq(projectPlans.companyId, companyId))
    .orderBy(desc(projectPlans.createdAt));

  const result: ProjectPlanBalance[] = [];
  for (const row of rows) {
    // Rollover só em instâncias ativas; canceladas/pendentes mostram o ciclo congelado
    result.push(
      await buildBalance(row, {
        rollover: row.projectPlan.status === "active",
        projectId: null,
      }),
    );
  }
  return result;
}

/** Instâncias de plano da empresa (ativas e canceladas) com saldo calculado. */
export async function getCompanyPlanInstances(
  user: SessionUser,
  companyId: string,
): Promise<ProjectPlanBalance[]> {
  requireTeam(user);
  return buildCompanyInstances(companyId);
}

/** Instâncias de plano da própria empresa do cliente (portal). */
export async function getPortalCompanyPlanInstances(
  user: SessionUser,
): Promise<ProjectPlanBalance[]> {
  if (user.role !== "client" || !user.companyId) {
    throw new ForbiddenError();
  }
  return buildCompanyInstances(user.companyId);
}

/** Resultado da tentativa de consumir cota. */
export type AllocateResult = "ok" | "quota_exceeded" | "payment_pending";

/**
 * Consome 1 cota (`kind`) para a demanda: primeiro a mensal do ciclo; se
 * esgotada, o pacote ativo mais antigo com crédito (FIFO).
 * - sem plano cobrindo o projeto → "ok" (sem controle);
 * - plano `pending_payment` → "payment_pending" (inadimplência bloqueia);
 * - sem saldo → "quota_exceeded".
 * Deve rodar DENTRO da transação de criação da demanda.
 */
export async function allocateQuota(
  tx: Pick<typeof db, "insert">,
  projectId: string,
  kind: UsageKind,
  demandId: string,
): Promise<AllocateResult> {
  const balance = await computeProjectPlanBalance(projectId);
  if (!balance) return "ok"; // sem plano → sem controle
  if (balance.status !== "active") return "payment_pending";

  if (balance.available[kind] <= 0) return "quota_exceeded";

  const monthlyLeft =
    balance.monthly[kind].limit - balance.monthly[kind].used;
  let packageId: string | null = null;
  if (monthlyLeft <= 0) {
    const pkg = balance.packages.find(
      (p) =>
        p.status === "active" &&
        (kind === "adjustment" ? p.adjustmentsLeft > 0 : p.pagesLeft > 0),
    );
    if (!pkg) return "quota_exceeded";
    packageId = pkg.id;
  }

  await tx.insert(projectPlanUsages).values({
    projectPlanId: balance.projectPlanId,
    demandId,
    projectId,
    packageId,
    kind,
  });
  return "ok";
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

/** Atualiza o projeto do consumo quando a demanda troca de projeto dentro da
 *  mesma instância de plano (super_admin). */
export async function updateQuotaProjectForDemand(
  demandId: string,
  projectId: string,
): Promise<void> {
  await db
    .update(projectPlanUsages)
    .set({ projectId })
    .where(
      and(
        eq(projectPlanUsages.demandId, demandId),
        isNull(projectPlanUsages.releasedAt),
      ),
    );
}

/** Erro de cota esgotada — traduzido em mensagem amigável na action. */
export class QuotaExceededError extends Error {
  constructor(public readonly kind: UsageKind) {
    super(`Limite de ${usageKindLabels[kind]} do plano atingido.`);
  }
}

/** Erro de plano com pagamento pendente — bloqueia novas demandas. */
export class PaymentPendingError extends Error {
  constructor() {
    super("Plano de manutenção aguardando pagamento.");
  }
}

/** Mensagem amigável de cota esgotada (portal e admin). */
export function quotaExceededMessage(kind: UsageKind): string {
  return `Limite de ${usageKindLabels[kind]} do plano de manutenção atingido neste ciclo. Adquira um pacote extra para continuar enviando demandas.`;
}

/** Mensagem amigável de plano com pagamento pendente. */
export function paymentPendingMessage(): string {
  return "O plano de manutenção está aguardando o pagamento do ciclo. Quite a fatura em Financeiro para voltar a enviar demandas.";
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

/** Query base dos planos ativos do catálogo. */
function queryActiveMaintenancePlans() {
  return db
    .select()
    .from(maintenancePlans)
    .where(eq(maintenancePlans.active, true))
    .orderBy(asc(maintenancePlans.valueCents), asc(maintenancePlans.name));
}

/** Planos ativos do catálogo (selects de ativação no admin). */
export async function listActiveMaintenancePlans(
  user: SessionUser,
): Promise<MaintenancePlan[]> {
  requireTeam(user);
  return queryActiveMaintenancePlans();
}

/** Catálogo de planos ativos para o portal (contratação pelo cliente).
 *  O acesso é garantido pela página (requireUser + role client). */
export async function listCatalogMaintenancePlans(): Promise<
  MaintenancePlan[]
> {
  return queryActiveMaintenancePlans();
}
