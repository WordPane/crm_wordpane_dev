"use server";

import { addDays, format, parseISO } from "date-fns";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertCompanyAccess,
  ForbiddenError,
  requireSuperAdmin,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import {
  AsaasError,
  createPayment,
  createSubscription,
  deletePayment,
  deleteSubscription,
  ensureCustomer,
  updateSubscription,
} from "@/lib/asaas/client";
import { db } from "@/lib/db";
import {
  charges,
  maintenancePackages,
  maintenancePlans,
  projectPlanPackages,
  projectPlanProjects,
  projectPlans,
  projects,
} from "@/lib/db/schema";
import { cancelInvoiceForCharge } from "@/lib/invoices";
import {
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { computeProjectPlanBalance } from "@/lib/queries/maintenance";
import { businessToday, formatCurrency } from "@/lib/utils/format";
import {
  changePlanSchema,
  companyPlanSchema,
  maintenancePackageSchema,
  maintenancePlanSchema,
  planCoverageSchema,
  planPackageSchema,
  purchasePackageSchema,
  subscribePlanSchema,
} from "@/lib/validations/maintenance";
import { parseCurrencyToCents } from "@/lib/validations/quote";
import { cancelCharge } from "@/server/actions/finance";
import { actionError, type ActionResult } from "@/server/actions/utils";

function revalidateCompany(companyId: string, projectIds: string[] = []) {
  revalidatePath(`/admin/clientes/${companyId}`);
  for (const projectId of projectIds) {
    revalidatePath(`/admin/projetos/${projectId}`);
    revalidatePath(`/portal/projetos/${projectId}`);
  }
  revalidatePath("/portal/demandas");
  revalidatePath("/portal/plano");
  revalidatePath("/portal/financeiro");
}

// ─────────────────────────── Catálogo: planos ───────────────────────────

export async function createMaintenancePlan(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = maintenancePlanSchema.parse(input);
    const valueCents = parseCurrencyToCents(data.value);
    if (valueCents === null || valueCents < 0) {
      return { error: "Valor inválido (ex.: 490,00)." };
    }
    const [created] = await db
      .insert(maintenancePlans)
      .values({
        name: data.name,
        description: data.description || null,
        adjustmentsLimit: data.adjustmentsLimit,
        pagesLimit: data.pagesLimit,
        valueCents,
      })
      .returning({ id: maintenancePlans.id });
    revalidatePath("/admin/financeiro/servicos");
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateMaintenancePlan(
  planId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = maintenancePlanSchema.parse(input);
    const valueCents = parseCurrencyToCents(data.value);
    if (valueCents === null || valueCents < 0) {
      return { error: "Valor inválido (ex.: 490,00)." };
    }
    await db
      .update(maintenancePlans)
      .set({
        name: data.name,
        description: data.description || null,
        adjustmentsLimit: data.adjustmentsLimit,
        pagesLimit: data.pagesLimit,
        valueCents,
        updatedAt: new Date(),
      })
      .where(eq(maintenancePlans.id, planId));
    revalidatePath("/admin/financeiro/servicos");
    return { success: true, id: planId };
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleMaintenancePlan(planId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const [plan] = await db
      .select({ active: maintenancePlans.active })
      .from(maintenancePlans)
      .where(eq(maintenancePlans.id, planId))
      .limit(1);
    if (!plan) return { error: "Plano não encontrado." };
    await db
      .update(maintenancePlans)
      .set({ active: !plan.active, updatedAt: new Date() })
      .where(eq(maintenancePlans.id, planId));
    revalidatePath("/admin/financeiro/servicos");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Catálogo: pacotes ───────────────────────────

export async function createMaintenancePackage(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = maintenancePackageSchema.parse(input);
    const valueCents = parseCurrencyToCents(data.value);
    if (valueCents === null || valueCents < 0) {
      return { error: "Valor inválido (ex.: 190,00)." };
    }
    const [created] = await db
      .insert(maintenancePackages)
      .values({
        name: data.name,
        adjustments: data.adjustments,
        pages: data.pages,
        valueCents,
      })
      .returning({ id: maintenancePackages.id });
    revalidatePath("/admin/financeiro/servicos");
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateMaintenancePackage(
  packageId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = maintenancePackageSchema.parse(input);
    const valueCents = parseCurrencyToCents(data.value);
    if (valueCents === null || valueCents < 0) {
      return { error: "Valor inválido (ex.: 190,00)." };
    }
    await db
      .update(maintenancePackages)
      .set({
        name: data.name,
        adjustments: data.adjustments,
        pages: data.pages,
        valueCents,
        updatedAt: new Date(),
      })
      .where(eq(maintenancePackages.id, packageId));
    revalidatePath("/admin/financeiro/servicos");
    return { success: true, id: packageId };
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleMaintenancePackage(packageId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const [pkg] = await db
      .select({ active: maintenancePackages.active })
      .from(maintenancePackages)
      .where(eq(maintenancePackages.id, packageId))
      .limit(1);
    if (!pkg) return { error: "Pacote não encontrado." };
    await db
      .update(maintenancePackages)
      .set({ active: !pkg.active, updatedAt: new Date() })
      .where(eq(maintenancePackages.id, packageId));
    revalidatePath("/admin/financeiro/servicos");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Planos da empresa (admin) ───────────────────────────

/** Projetos conflitantes: já cobertos por outra instância ativa ou pendente.
 *  Passar a transação (`tx`) quando o check faz parte de uma mutação com
 *  advisory lock — a leitura precisa enxergar o estado dentro da transação. */
async function findCoverageConflicts(
  projectIds: string[],
  excludePlanId?: string,
  executor: Pick<typeof db, "select"> = db,
): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const rows = await executor
    .select({ name: projects.name })
    .from(projectPlanProjects)
    .innerJoin(
      projectPlans,
      eq(projectPlanProjects.projectPlanId, projectPlans.id),
    )
    .innerJoin(projects, eq(projectPlanProjects.projectId, projects.id))
    .where(
      and(
        inArray(projectPlanProjects.projectId, projectIds),
        inArray(projectPlans.status, ["active", "pending_payment"]),
        excludePlanId
          ? sql`${projectPlans.id} <> ${excludePlanId}`
          : undefined,
      ),
    );
  return rows.map((r) => r.name);
}

/**
 * Ativa um plano de manutenção para a empresa cobrindo 1..N projetos
 * (pool de cotas compartilhado entre eles). Ciclo inicia hoje.
 */
export async function activateCompanyPlan(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = companyPlanSchema.parse(input);
    await assertCompanyAccess(user, data.companyId);

    const [plan] = await db
      .select({ id: maintenancePlans.id, name: maintenancePlans.name })
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, data.planId), eq(maintenancePlans.active, true)))
      .limit(1);
    if (!plan) return { error: "Plano não encontrado ou inativo." };

    const companyProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.companyId, data.companyId), inArray(projects.id, data.projectIds)));
    if (companyProjects.length !== data.projectIds.length) {
      return { error: "Todos os projetos precisam ser da empresa." };
    }

    // Lock advisory por empresa: check de conflito + criação da cobertura na
    // mesma transação — duas requisições concorrentes (portal + admin) não
    // cobrem o mesmo projeto em duas instâncias
    const activation = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${data.companyId}))`,
      );

      const conflicts = await findCoverageConflicts(data.projectIds, undefined, tx);
      if (conflicts.length > 0) return { created: null, conflicts };

      const [created] = await tx
        .insert(projectPlans)
        .values({
          companyId: data.companyId,
          planId: plan.id,
          status: "active",
          currentPeriodStart: businessToday(),
          createdBy: user.id,
        })
        .returning({ id: projectPlans.id });
      await tx.insert(projectPlanProjects).values(
        data.projectIds.map((projectId) => ({
          projectPlanId: created.id,
          projectId,
        })),
      );
      return { created, conflicts: [] };
    });
    if (!activation.created) {
      const conflicts = activation.conflicts;
      return {
        error: `${conflicts.join(", ")} já ${conflicts.length === 1 ? "está coberto" : "estão cobertos"} por outro plano ativo.`,
      };
    }
    const created = activation.created;

    await logActivity({
      actorId: user.id,
      companyId: data.companyId,
      entityType: "company",
      entityId: data.companyId,
      action: "company.plan_activated",
      metadata: { plan: plan.name, projects: data.projectIds.length },
    });

    revalidateCompany(data.companyId, data.projectIds);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Ajusta a cobertura (projetos) de uma instância ativa. Mínimo 1 projeto. */
export async function updateCompanyPlanCoverage(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = planCoverageSchema.parse(input);

    const [instance] = await db
      .select()
      .from(projectPlans)
      .where(eq(projectPlans.id, data.projectPlanId))
      .limit(1);
    if (!instance) return { error: "Plano não encontrado." };
    if (instance.status !== "active") {
      return { error: "Só é possível ajustar a cobertura de um plano ativo." };
    }
    await assertCompanyAccess(user, instance.companyId);

    const companyProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.companyId, instance.companyId), inArray(projects.id, data.projectIds)));
    if (companyProjects.length !== data.projectIds.length) {
      return { error: "Todos os projetos precisam ser da empresa." };
    }

    // Lock advisory por empresa: check de conflito + troca da cobertura na
    // mesma transação (concorrência não cobre o mesmo projeto em 2 planos)
    const coverage = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${instance.companyId}))`,
      );

      const conflicts = await findCoverageConflicts(
        data.projectIds,
        instance.id,
        tx,
      );
      if (conflicts.length > 0) return { oldLinks: null, conflicts };

      // Cobertura antiga também precisa ser revalidada (projetos que saíram)
      const oldLinks = await tx
        .select({ projectId: projectPlanProjects.projectId })
        .from(projectPlanProjects)
        .where(eq(projectPlanProjects.projectPlanId, instance.id));

      await tx
        .delete(projectPlanProjects)
        .where(eq(projectPlanProjects.projectPlanId, instance.id));
      await tx.insert(projectPlanProjects).values(
        data.projectIds.map((projectId) => ({
          projectPlanId: instance.id,
          projectId,
        })),
      );
      return { oldLinks, conflicts: [] };
    });
    if (!coverage.oldLinks) {
      const conflicts = coverage.conflicts;
      return {
        error: `${conflicts.join(", ")} já ${conflicts.length === 1 ? "está coberto" : "estão cobertos"} por outro plano ativo.`,
      };
    }

    await logActivity({
      actorId: user.id,
      companyId: instance.companyId,
      entityType: "company",
      entityId: instance.companyId,
      action: "company.plan_coverage_updated",
      metadata: { projects: data.projectIds.length },
    });

    revalidateCompany(instance.companyId, [
      ...new Set([
        ...coverage.oldLinks.map((l) => l.projectId),
        ...data.projectIds,
      ]),
    ]);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Troca o plano de uma instância ativa (ciclo e consumo são mantidos). */
export async function changeCompanyPlan(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = changePlanSchema.parse(input);

    const [instance] = await db
      .select()
      .from(projectPlans)
      .where(eq(projectPlans.id, data.projectPlanId))
      .limit(1);
    if (!instance) return { error: "Plano não encontrado." };
    if (instance.status !== "active") {
      return { error: "Só é possível trocar um plano ativo." };
    }
    await assertCompanyAccess(user, instance.companyId);

    const [plan] = await db
      .select({
        id: maintenancePlans.id,
        name: maintenancePlans.name,
        valueCents: maintenancePlans.valueCents,
      })
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, data.planId), eq(maintenancePlans.active, true)))
      .limit(1);
    if (!plan) return { error: "Plano não encontrado ou inativo." };

    // Assinatura recorrente: o valor novo precisa valer no Asaas ANTES da
    // troca local — se falhar, aborta para não divergir (conceder a cota do
    // plano novo cobrando o valor do antigo). Avulso não tem assinatura.
    if (instance.asaasSubscriptionId) {
      await updateSubscription({
        asaasSubscriptionId: instance.asaasSubscriptionId,
        valueCents: plan.valueCents,
      });
    }

    await db
      .update(projectPlans)
      .set({ planId: plan.id, updatedAt: new Date() })
      .where(eq(projectPlans.id, instance.id));

    await logActivity({
      actorId: user.id,
      companyId: instance.companyId,
      entityType: "company",
      entityId: instance.companyId,
      action: "company.plan_changed",
      metadata: { plan: plan.name },
    });

    revalidateCompany(instance.companyId);
    return { success: true };
  } catch (error) {
    if (error instanceof AsaasError) return { error: error.message };
    return actionError(error);
  }
}

/** Cancela a instância de plano da empresa (histórico é mantido).
 *  Com assinatura Asaas (recurring), cancela lá também (best-effort). */
export async function cancelCompanyPlan(
  projectPlanId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [instance] = await db
      .select()
      .from(projectPlans)
      .where(eq(projectPlans.id, projectPlanId))
      .limit(1);
    if (!instance) return { error: "Plano não encontrado." };
    await assertCompanyAccess(user, instance.companyId);

    // Avulso aguardando pagamento: há uma cobrança em aberto no Asaas —
    // cancela junto para não virar receita órfã (mesmo fluxo do pacote)
    if (
      instance.billingMode === "one_time" &&
      instance.status === "pending_payment"
    ) {
      const [pendingCharge] = await db
        .select({ id: charges.id })
        .from(charges)
        .where(
          and(
            eq(charges.projectPlanId, instance.id),
            inArray(charges.status, ["pending", "overdue"]),
          ),
        )
        .limit(1);
      if (pendingCharge) {
        const result = await cancelCharge(pendingCharge.id);
        if ("error" in result) return result;
      }
    }

    if (instance.asaasSubscriptionId) {
      try {
        await deleteSubscription(instance.asaasSubscriptionId);
      } catch (error) {
        // Assinatura já removida ou Asaas instável — cancela local mesmo assim
        console.error(
          `Falha ao cancelar assinatura ${instance.asaasSubscriptionId} no Asaas:`,
          error,
        );
      }
    }

    await db
      .update(projectPlans)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectPlans.id, instance.id));

    await logActivity({
      actorId: user.id,
      companyId: instance.companyId,
      entityType: "company",
      entityId: instance.companyId,
      action: "company.plan_cancelled",
      metadata: {},
    });

    revalidateCompany(instance.companyId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Adiciona pacote manualmente à instância (sem cobrança). */
export async function addPackageToPlan(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = planPackageSchema.parse(input);

    const [instance] = await db
      .select()
      .from(projectPlans)
      .where(eq(projectPlans.id, data.projectPlanId))
      .limit(1);
    if (!instance) return { error: "Plano não encontrado." };
    if (instance.status !== "active") {
      return { error: "O plano precisa estar ativo para receber pacotes." };
    }
    await assertCompanyAccess(user, instance.companyId);

    const [pkg] = await db
      .select()
      .from(maintenancePackages)
      .where(eq(maintenancePackages.id, data.packageId))
      .limit(1);
    if (!pkg) return { error: "Pacote não encontrado." };

    const [created] = await db
      .insert(projectPlanPackages)
      .values({
        projectPlanId: instance.id,
        packageId: pkg.id,
        name: pkg.name,
        adjustments: pkg.adjustments,
        pages: pkg.pages,
        valueCents: pkg.valueCents,
        chargeId: null,
        status: "active",
        createdBy: user.id,
      })
      .returning({ id: projectPlanPackages.id });

    await logActivity({
      actorId: user.id,
      companyId: instance.companyId,
      entityType: "company",
      entityId: instance.companyId,
      action: "company.plan_package_added",
      metadata: { package: pkg.name },
    });

    revalidateCompany(instance.companyId);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Cancela um pacote do projeto; se houver cobrança em aberto, cancela junto. */
export async function cancelProjectPlanPackage(
  packageRowId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [row] = await db
      .select({
        id: projectPlanPackages.id,
        status: projectPlanPackages.status,
        chargeId: projectPlanPackages.chargeId,
        projectPlanId: projectPlanPackages.projectPlanId,
      })
      .from(projectPlanPackages)
      .where(eq(projectPlanPackages.id, packageRowId))
      .limit(1);
    if (!row) return { error: "Pacote não encontrado." };
    if (row.status === "cancelled") return { success: true };

    const [plan] = await db
      .select({ companyId: projectPlans.companyId })
      .from(projectPlans)
      .where(eq(projectPlans.id, row.projectPlanId))
      .limit(1);
    if (!plan) return { error: "Plano não encontrado." };
    await assertCompanyAccess(user, plan.companyId);

    // Pacote pago à vista: se ainda não pagou, cancela a cobrança no Asaas
    if (row.chargeId && row.status === "pending_payment") {
      const result = await cancelCharge(row.chargeId);
      if ("error" in result) return result;
    }

    await db
      .update(projectPlanPackages)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectPlanPackages.id, row.id));

    revalidateCompany(plan.companyId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Compra pelo cliente (portal) ───────────────────────────

/**
 * Cliente compra pacote extra: gera cobrança no Asaas e registra o pacote
 * como pendente — o webhook ativa os créditos quando o pagamento confirma.
 */
export async function purchasePlanPackage(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
    const companyId = user.companyId;
    const data = purchasePackageSchema.parse(input);

    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.companyId, companyId)))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };

    const balance = await computeProjectPlanBalance(project.id);
    if (!balance) {
      return { error: "Este projeto não tem plano de manutenção ativo." };
    }
    if (balance.status !== "active") {
      // allocateQuota bloqueia demandas com fatura em aberto — pacotes
      // comprados nesse estado não poderiam ser usados
      return {
        error:
          "O plano está com uma fatura em aberto — quite a fatura do plano antes de adquirir pacotes.",
      };
    }

    const [pkg] = await db
      .select()
      .from(maintenancePackages)
      .where(and(eq(maintenancePackages.id, data.packageId), eq(maintenancePackages.active, true)))
      .limit(1);
    if (!pkg) return { error: "Pacote não encontrado." };
    if (pkg.valueCents <= 0) return { error: "Pacote sem valor definido." };

    const description = `Pacote extra "${pkg.name}" — ${project.name}`;
    // Mesma base de data do cron (businessToday), não o relógio UTC
    const dueDate = format(addDays(parseISO(businessToday()), 3), "yyyy-MM-dd");

    // Mesmo fluxo de createCharge: registro local primeiro (externalReference)
    const [charge] = await db
      .insert(charges)
      .values({
        companyId,
        description,
        valueCents: pkg.valueCents,
        billingType: "undefined",
        dueDate,
        createdBy: user.id,
      })
      .returning({ id: charges.id });

    try {
      const customerId = await ensureCustomer(companyId);
      const payment = await createPayment({
        customerId,
        billingType: "undefined",
        valueCents: pkg.valueCents,
        dueDate,
        description,
        externalReference: charge.id,
      });
      await db
        .update(charges)
        .set({
          asaasPaymentId: payment.id,
          invoiceUrl: payment.invoiceUrl ?? null,
          bankSlipUrl: payment.bankSlipUrl ?? null,
        })
        .where(eq(charges.id, charge.id));
    } catch (error) {
      await db.delete(charges).where(eq(charges.id, charge.id));
      throw error;
    }

    await db.insert(projectPlanPackages).values({
      projectPlanId: balance.projectPlanId,
      packageId: pkg.id,
      name: pkg.name,
      adjustments: pkg.adjustments,
      pages: pkg.pages,
      valueCents: pkg.valueCents,
      chargeId: charge.id,
      status: "pending_payment",
      createdBy: user.id,
    });

    await logActivity({
      actorId: user.id,
      companyId,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      action: "project.plan_package_purchased",
      metadata: {
        project: project.name,
        package: pkg.name,
        value: formatCurrency(pkg.valueCents),
      },
    });

    const team = await teamUsersOfCompany(companyId);
    await notifyUsers(team, {
      type: "plan.package_purchased",
      title: `Pacote extra adquirido: ${pkg.name}`,
      body: `${user.name} comprou o pacote "${pkg.name}" para o projeto "${project.name}". Créditos liberados após o pagamento.`,
      href: `/admin/projetos/${project.id}`,
    });

    revalidatePath(`/portal/projetos/${project.id}`);
    revalidatePath("/portal/financeiro");
    revalidatePath(`/admin/projetos/${project.id}`);
    revalidatePath(`/admin/clientes/${companyId}`);
    return { success: true, id: charge.id };
  } catch (error) {
    if (error instanceof AsaasError) return { error: error.message };
    return actionError(error);
  }
}

// ─────────────────────────── Contratação pelo cliente (portal) ───────────────────────────

/**
 * Cliente contrata o plano de manutenção: cria a instância como
 * `pending_payment` e cobra conforme a modalidade —
 * `one_time`: cobrança avulsa imediata do ciclo corrente;
 * `recurring`: assinatura mensal no Asaas (1ª cobrança chega via webhook).
 * O webhook ativa a instância quando o pagamento confirma.
 */
export async function subscribeToPlan(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
    const companyId = user.companyId;
    const data = subscribePlanSchema.parse(input);

    const [plan] = await db
      .select()
      .from(maintenancePlans)
      .where(
        and(
          eq(maintenancePlans.id, data.planId),
          eq(maintenancePlans.active, true),
        ),
      )
      .limit(1);
    if (!plan) return { error: "Plano não encontrado." };
    if (plan.valueCents <= 0) {
      return { error: "Este plano está sem valor definido — fale com a equipe." };
    }

    const companyProjects = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.companyId, companyId),
          inArray(projects.id, data.projectIds),
        ),
      );
    if (companyProjects.length !== data.projectIds.length) {
      return { error: "Projeto não encontrado." };
    }

    const periodStart = businessToday();
    const cycleLabel = format(parseISO(periodStart), "MM/yyyy");
    const description = `Plano de manutenção "${plan.name}" — ciclo ${cycleLabel}`;

    // Lock advisory por empresa: check de conflito + criação da instância e
    // da cobertura na mesma transação — requisições concorrentes (cliente no
    // portal + admin) não cobrem o mesmo projeto em duas instâncias
    const signup = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`,
      );

      const conflicts = await findCoverageConflicts(data.projectIds, undefined, tx);
      if (conflicts.length > 0) return { created: null, conflicts };

      const [created] = await tx
        .insert(projectPlans)
        .values({
          companyId,
          planId: plan.id,
          status: "pending_payment",
          billingMode: data.billingMode,
          currentPeriodStart: periodStart,
          createdBy: user.id,
        })
        .returning({ id: projectPlans.id });
      await tx.insert(projectPlanProjects).values(
        data.projectIds.map((projectId) => ({
          projectPlanId: created.id,
          projectId,
        })),
      );
      return { created, conflicts: [] };
    });
    if (!signup.created) {
      const conflicts = signup.conflicts;
      return {
        error: `${conflicts.join(", ")} já ${conflicts.length === 1 ? "está coberto" : "estão cobertos"} por outro plano.`,
      };
    }
    const instance = signup.created;

    let asaasSubscriptionId: string | null = null;
    try {
      if (data.billingMode === "one_time") {
        // Mesma base de data do cron (businessToday), não o relógio UTC
        const dueDate = format(addDays(parseISO(periodStart), 3), "yyyy-MM-dd");
        const [charge] = await db
          .insert(charges)
          .values({
            companyId,
            projectPlanId: instance.id,
            description,
            valueCents: plan.valueCents,
            billingType: "undefined",
            dueDate,
            createdBy: user.id,
          })
          .returning({ id: charges.id });
        try {
          const customerId = await ensureCustomer(companyId);
          const payment = await createPayment({
            customerId,
            billingType: "undefined",
            valueCents: plan.valueCents,
            dueDate,
            description,
            externalReference: charge.id,
          });
          await db
            .update(charges)
            .set({
              asaasPaymentId: payment.id,
              invoiceUrl: payment.invoiceUrl ?? null,
              bankSlipUrl: payment.bankSlipUrl ?? null,
            })
            .where(eq(charges.id, charge.id));
        } catch (error) {
          await db.delete(charges).where(eq(charges.id, charge.id));
          throw error;
        }
        await db
          .update(projectPlans)
          .set({ lastBilledPeriodStart: periodStart })
          .where(eq(projectPlans.id, instance.id));
      } else {
        const customerId = await ensureCustomer(companyId);
        const subscription = await createSubscription({
          customerId,
          billingType: "undefined",
          valueCents: plan.valueCents,
          nextDueDate: periodStart,
          cycle: "monthly",
          description,
          externalReference: instance.id,
        });
        asaasSubscriptionId = subscription.id;
        await db
          .update(projectPlans)
          .set({ asaasSubscriptionId: subscription.id })
          .where(eq(projectPlans.id, instance.id));
      }
    } catch (error) {
      // Assinatura criada no Asaas mas o vínculo local falhou → cancela lá
      // (best-effort) para não ficar cobrando sem dono
      if (asaasSubscriptionId) {
        try {
          await deleteSubscription(asaasSubscriptionId);
        } catch (cancelError) {
          console.error(
            `Falha ao cancelar assinatura órfã ${asaasSubscriptionId} no Asaas:`,
            cancelError,
          );
        }
      }
      // Falhou no Asaas → remove a instância (cascade limpa a cobertura)
      await db.delete(projectPlans).where(eq(projectPlans.id, instance.id));
      throw error;
    }

    await logActivity({
      actorId: user.id,
      companyId,
      entityType: "company",
      entityId: companyId,
      action: "company.plan_subscribed",
      metadata: {
        plan: plan.name,
        billingMode: data.billingMode,
        projects: companyProjects.length,
      },
    });

    const team = await teamUsersOfCompany(companyId);
    await notifyUsers(team, {
      type: "plan.subscribed",
      title: `Plano contratado: ${plan.name}`,
      body: `${user.name} contratou o plano "${plan.name}" (${data.billingMode === "one_time" ? "mensal avulso" : "assinatura recorrente"}) cobrindo ${companyProjects.length} ${companyProjects.length === 1 ? "projeto" : "projetos"}. Ativa após o pagamento.`,
      href: `/admin/clientes/${companyId}?tab=manutencao`,
    });

    revalidateCompany(companyId, data.projectIds);
    revalidatePath("/portal/plano");
    revalidatePath("/portal/financeiro");
    return { success: true, id: instance.id };
  } catch (error) {
    if (error instanceof AsaasError) return { error: error.message };
    return actionError(error);
  }
}

/**
 * Cliente desiste de uma contratação ainda não paga: cancela a cobrança
 * pendente no Asaas (best-effort) e a assinatura, se houver, e marca a
 * instância como cancelada. Só instâncias `pending_payment` da própria
 * empresa — plano ativo segue o fluxo da equipe (cancelCompanyPlan).
 */
export async function cancelOwnPlanInstance(
  projectPlanId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
    const companyId = user.companyId;

    const [instance] = await db
      .select()
      .from(projectPlans)
      .where(eq(projectPlans.id, projectPlanId))
      .limit(1);
    if (!instance || instance.companyId !== companyId) {
      return { error: "Plano não encontrado." };
    }
    if (instance.status !== "pending_payment") {
      return {
        error: "Só é possível cancelar uma contratação aguardando pagamento.",
      };
    }

    // Assinatura recorrente: cancela no Asaas (best-effort) para não
    // continuar gerando cobranças de um plano cancelado
    if (instance.asaasSubscriptionId) {
      try {
        await deleteSubscription(instance.asaasSubscriptionId);
      } catch (error) {
        console.error(
          `Falha ao cancelar assinatura ${instance.asaasSubscriptionId} no Asaas:`,
          error,
        );
      }
    }

    // Cobrança de ativação/renovação em aberto: cancela no Asaas junto
    // (best-effort — a instância é cancelada localmente mesmo se falhar)
    const [pendingCharge] = await db
      .select()
      .from(charges)
      .where(
        and(
          eq(charges.projectPlanId, instance.id),
          inArray(charges.status, ["pending", "overdue"]),
        ),
      )
      .limit(1);
    if (pendingCharge) {
      try {
        await cancelInvoiceForCharge(pendingCharge.id);
        if (pendingCharge.asaasPaymentId) {
          await deletePayment(pendingCharge.asaasPaymentId);
        }
      } catch (error) {
        console.error(
          `Falha ao cancelar a cobrança ${pendingCharge.id} no Asaas:`,
          error,
        );
      }
      await db
        .update(charges)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(charges.id, pendingCharge.id));
    }

    await db
      .update(projectPlans)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectPlans.id, instance.id));

    await logActivity({
      actorId: user.id,
      companyId,
      entityType: "company",
      entityId: companyId,
      action: "company.plan_cancelled",
      metadata: { origem: "portal" },
    });

    revalidateCompany(companyId);
    return { success: true, id: instance.id };
  } catch (error) {
    return actionError(error);
  }
}
