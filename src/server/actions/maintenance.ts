"use server";

import { addDays, format } from "date-fns";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertProjectAccess,
  ForbiddenError,
  requireSuperAdmin,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { AsaasError, createPayment, ensureCustomer } from "@/lib/asaas/client";
import { db } from "@/lib/db";
import {
  charges,
  maintenancePackages,
  maintenancePlans,
  projectPlanPackages,
  projectPlans,
  projects,
} from "@/lib/db/schema";
import {
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { computeProjectPlanBalance } from "@/lib/queries/maintenance";
import { businessToday, formatCurrency } from "@/lib/utils/format";
import {
  activateProjectPlanSchema,
  maintenancePackageSchema,
  maintenancePlanSchema,
  purchasePackageSchema,
} from "@/lib/validations/maintenance";
import { parseCurrencyToCents } from "@/lib/validations/quote";
import { cancelCharge } from "@/server/actions/finance";
import { actionError, type ActionResult } from "@/server/actions/utils";

function revalidateProject(projectId: string, companyId: string) {
  revalidatePath(`/admin/projetos/${projectId}`);
  revalidatePath(`/portal/projetos/${projectId}`);
  revalidatePath("/portal/demandas");
  revalidatePath(`/admin/clientes/${companyId}`);
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
    revalidatePath("/admin/configuracoes");
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
    revalidatePath("/admin/configuracoes");
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
    revalidatePath("/admin/configuracoes");
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
    revalidatePath("/admin/configuracoes");
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
    revalidatePath("/admin/configuracoes");
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
    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Plano do projeto (admin) ───────────────────────────

/**
 * Ativa o plano no projeto (ou troca o plano mantendo o ciclo). Reativação
 * após cancelamento começa um ciclo novo a partir de hoje.
 */
export async function activateProjectPlan(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = activateProjectPlanSchema.parse(input);

    const [project] = await db
      .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };
    await assertProjectAccess(user, project);

    const [plan] = await db
      .select({ id: maintenancePlans.id, name: maintenancePlans.name })
      .from(maintenancePlans)
      .where(and(eq(maintenancePlans.id, data.planId), eq(maintenancePlans.active, true)))
      .limit(1);
    if (!plan) return { error: "Plano não encontrado ou inativo." };

    const [existing] = await db
      .select()
      .from(projectPlans)
      .where(eq(projectPlans.projectId, project.id))
      .limit(1);

    if (existing && existing.status === "active") {
      // Troca de plano: ciclo e consumo são mantidos
      await db
        .update(projectPlans)
        .set({ planId: plan.id, updatedAt: new Date() })
        .where(eq(projectPlans.id, existing.id));
    } else if (existing) {
      // Reativação: ciclo novo a partir de hoje
      await db
        .update(projectPlans)
        .set({
          planId: plan.id,
          status: "active",
          currentPeriodStart: businessToday(),
          updatedAt: new Date(),
        })
        .where(eq(projectPlans.id, existing.id));
    } else {
      await db.insert(projectPlans).values({
        projectId: project.id,
        planId: plan.id,
        status: "active",
        currentPeriodStart: businessToday(),
        createdBy: user.id,
      });
    }

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      action: "project.plan_activated",
      metadata: { project: project.name, plan: plan.name },
    });

    revalidateProject(project.id, project.companyId);
    return { success: true, id: project.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Cancela o plano do projeto (histórico de consumo é mantido). */
export async function cancelProjectPlan(projectId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [project] = await db
      .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };
    await assertProjectAccess(user, project);

    await db
      .update(projectPlans)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectPlans.projectId, projectId));

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      action: "project.plan_cancelled",
      metadata: { project: project.name },
    });

    revalidateProject(project.id, project.companyId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Adiciona pacote manualmente (sem cobrança — pagamento tratado por fora). */
export async function addPackageToProject(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = purchasePackageSchema.parse(input);

    const [project] = await db
      .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };
    await assertProjectAccess(user, project);

    const balance = await computeProjectPlanBalance(project.id);
    if (!balance) {
      return { error: "Ative um plano de manutenção no projeto primeiro." };
    }

    const [pkg] = await db
      .select()
      .from(maintenancePackages)
      .where(eq(maintenancePackages.id, data.packageId))
      .limit(1);
    if (!pkg) return { error: "Pacote não encontrado." };

    const [created] = await db
      .insert(projectPlanPackages)
      .values({
        projectPlanId: balance.projectPlanId,
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
      companyId: project.companyId,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      action: "project.plan_package_added",
      metadata: { project: project.name, package: pkg.name },
    });

    revalidateProject(project.id, project.companyId);
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
      .select({ projectId: projectPlans.projectId })
      .from(projectPlans)
      .where(eq(projectPlans.id, row.projectPlanId))
      .limit(1);
    if (!plan) return { error: "Plano não encontrado." };

    const [project] = await db
      .select({ id: projects.id, companyId: projects.companyId })
      .from(projects)
      .where(eq(projects.id, plan.projectId))
      .limit(1);
    if (project) await assertProjectAccess(user, project);

    // Pacote pago à vista: se ainda não pagou, cancela a cobrança no Asaas
    if (row.chargeId && row.status === "pending_payment") {
      const result = await cancelCharge(row.chargeId);
      if ("error" in result) return result;
    }

    await db
      .update(projectPlanPackages)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectPlanPackages.id, row.id));

    if (project) revalidateProject(project.id, project.companyId);
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

    const [pkg] = await db
      .select()
      .from(maintenancePackages)
      .where(and(eq(maintenancePackages.id, data.packageId), eq(maintenancePackages.active, true)))
      .limit(1);
    if (!pkg) return { error: "Pacote não encontrado." };
    if (pkg.valueCents <= 0) return { error: "Pacote sem valor definido." };

    const description = `Pacote extra "${pkg.name}" — ${project.name}`;
    const dueDate = format(addDays(new Date(), 3), "yyyy-MM-dd");

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
    return { success: true, id: charge.id };
  } catch (error) {
    if (error instanceof AsaasError) return { error: error.message };
    return actionError(error);
  }
}
