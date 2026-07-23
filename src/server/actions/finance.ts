"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  assertCompanyAccess,
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
  updatePayment,
} from "@/lib/asaas/client";
import { db } from "@/lib/db";
import {
  charges,
  companyServices,
  invoices,
  quotes,
  services,
  serviceTeamMembers,
  users,
} from "@/lib/db/schema";
import {
  cancelInvoiceForCharge,
  emitInvoiceForCharge,
  emitInvoiceForNewCharge,
} from "@/lib/invoices";
import {
  clientUsersOfCompany,
  notifyChargeCreated,
  notifyChargeReminder,
  notifyUsers,
} from "@/lib/notifications";
import { generateChargeForQuote } from "@/lib/quotes/automation";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import {
  activateServiceSchema,
  chargeFormSchema,
  chargeFromQuoteSchema,
  serviceFormSchema,
  updateChargeSchema,
} from "@/lib/validations/finance";
import { parseCurrencyToCents } from "@/lib/validations/quote";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Converte erros do Asaas em mensagem amigável; demais erros seguem o padrão. */
function financeError(error: unknown): { error: string } {
  if (error instanceof AsaasError) return { error: error.message };
  return actionError(error);
}

function revalidateFinance(companyId: string) {
  revalidatePath("/admin/financeiro");
  revalidatePath("/admin/financeiro/servicos");
  revalidatePath("/portal/financeiro");
  revalidatePath(`/admin/clientes/${companyId}`);
}

// ─────────────────────────── Catálogo de serviços ───────────────────────────

export async function createService(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = serviceFormSchema.parse(input);

    const valueCents = parseCurrencyToCents(data.defaultValue);
    if (valueCents === null || valueCents <= 0) {
      return { error: "Valor padrão inválido (ex.: 1.500,00)." };
    }

    const [service] = await db
      .insert(services)
      .values({
        name: data.name,
        description: data.description || null,
        defaultValueCents: valueCents,
        billing: data.billing,
        cycle: data.cycle,
        serviceCode: data.serviceCode || null,
        quoteRequestEnabled: data.quoteRequestEnabled,
        projectTemplateId: data.projectTemplateId || null,
      })
      .returning({ id: services.id });

    revalidatePath("/admin/financeiro/servicos");
    return { success: true, id: service.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateService(
  serviceId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = serviceFormSchema.parse(input);

    const valueCents = parseCurrencyToCents(data.defaultValue);
    if (valueCents === null || valueCents <= 0) {
      return { error: "Valor padrão inválido (ex.: 1.500,00)." };
    }

    await db
      .update(services)
      .set({
        name: data.name,
        description: data.description || null,
        defaultValueCents: valueCents,
        billing: data.billing,
        cycle: data.cycle,
        serviceCode: data.serviceCode || null,
        quoteRequestEnabled: data.quoteRequestEnabled,
        projectTemplateId: data.projectTemplateId || null,
        updatedAt: new Date(),
      })
      .where(eq(services.id, serviceId));

    revalidatePath("/admin/financeiro/servicos");
    return { success: true, id: serviceId };
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleServiceActive(
  serviceId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);

    const [service] = await db
      .select({ active: services.active })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!service) return { error: "Serviço não encontrado." };

    await db
      .update(services)
      .set({ active: !service.active, updatedAt: new Date() })
      .where(eq(services.id, serviceId));

    revalidatePath("/admin/financeiro/servicos");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Substitui a equipe vinculada ao serviço (copiada para o projeto gerado na
 * aprovação de um orçamento solicitado). Só super admin; todos os ids
 * precisam ser usuários ativos da equipe (admin ou super_admin).
 */
export async function setServiceTeamMembers(
  serviceId: string,
  userIds: string[],
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    if (
      !z.uuid().safeParse(serviceId).success ||
      userIds.some((id) => !z.uuid().safeParse(id).success)
    ) {
      return { error: "Dados inválidos." };
    }

    const [service] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.id, serviceId))
      .limit(1);
    if (!service) return { error: "Serviço não encontrado." };

    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length > 0) {
      const members = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(users.id, uniqueUserIds),
            eq(users.status, "active"),
            inArray(users.role, ["admin", "super_admin"]),
          ),
        );
      if (members.length !== uniqueUserIds.length) {
        return {
          error:
            "Todos os membros devem ser usuários ativos da equipe (admin ou super admin).",
        };
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(serviceTeamMembers)
        .where(eq(serviceTeamMembers.serviceId, serviceId));
      if (uniqueUserIds.length > 0) {
        await tx.insert(serviceTeamMembers).values(
          uniqueUserIds.map((userId) => ({ serviceId, userId })),
        );
      }
    });

    revalidatePath("/admin/financeiro/servicos");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Cobranças ───────────────────────────

/** Cria cobrança avulsa: registro local + payment no Asaas + notificação. */
export async function createCharge(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = chargeFormSchema.parse(input);
    await assertCompanyAccess(user, data.companyId);

    const valueCents = parseCurrencyToCents(data.value);
    if (valueCents === null || valueCents <= 0) {
      return { error: "Valor inválido (ex.: 1.500,00)." };
    }

    // Insere primeiro para usar o id como externalReference (conciliação)
    const [charge] = await db
      .insert(charges)
      .values({
        companyId: data.companyId,
        description: data.description,
        valueCents,
        billingType: data.billingType,
        dueDate: data.dueDate,
        createdBy: user.id,
      })
      .returning({ id: charges.id });

    try {
      const customerId = await ensureCustomer(data.companyId);
      const payment = await createPayment({
        customerId,
        billingType: data.billingType,
        valueCents,
        dueDate: data.dueDate,
        description: data.description,
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
      // Falhou no Asaas → remove o registro local para não ficar cobrança fantasma
      await db.delete(charges).where(eq(charges.id, charge.id));
      throw error;
    }

    // Empresa configurada para emitir a NF junto com a cobrança
    await emitInvoiceForNewCharge(data.companyId, charge.id);

    await logActivity({
      actorId: user.id,
      companyId: data.companyId,
      entityType: "charge",
      entityId: charge.id,
      action: "charge.created",
      metadata: {
        description: data.description,
        value: formatCurrency(valueCents),
      },
    });
    await notifyChargeCreated(
      data.companyId,
      data.description,
      valueCents,
      data.dueDate,
    );

    revalidateFinance(data.companyId);
    return { success: true, id: charge.id };
  } catch (error) {
    return financeError(error);
  }
}

/** Cancela a cobrança (no Asaas e local). Só cobranças não pagas. */
export async function cancelCharge(chargeId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [charge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1);
    if (!charge) return { error: "Cobrança não encontrada." };
    await assertCompanyAccess(user, charge.companyId);
    if (charge.status === "confirmed" || charge.status === "received") {
      return { error: "Cobranças já pagas não podem ser canceladas." };
    }
    if (charge.status === "cancelled") return { success: true };

    // Cancela a NF antes (se houver): não deixar nota autorizada órfã.
    // Se o Asaas recusar o cancelamento, a cobrança permanece ativa.
    const invoiceCancel = await cancelInvoiceForCharge(chargeId);
    if (!invoiceCancel.ok) {
      return {
        error: `Não foi possível cancelar a nota fiscal: ${invoiceCancel.error}`,
      };
    }

    if (charge.asaasPaymentId) {
      await deletePayment(charge.asaasPaymentId);
    }

    await db
      .update(charges)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(charges.id, chargeId));

    await logActivity({
      actorId: user.id,
      companyId: charge.companyId,
      entityType: "charge",
      entityId: chargeId,
      action: "charge.cancelled",
      metadata: { description: charge.description },
    });

    revalidateFinance(charge.companyId);
    return { success: true };
  } catch (error) {
    return financeError(error);
  }
}

/**
 * Exclui o registro local de uma cobrança CANCELADA (limpeza p/ contabilidade).
 * O Asaas já não tem a cobrança (cancelada antes); notas em erro/canceladas
 * vão junto (cascade). Nota autorizada/em emissão bloqueia a exclusão.
 */
export async function deleteCharge(chargeId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [charge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1);
    if (!charge) return { error: "Cobrança não encontrada." };
    await assertCompanyAccess(user, charge.companyId);
    if (charge.status !== "cancelled") {
      return { error: "Só é possível excluir cobranças canceladas." };
    }

    const [invoice] = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(eq(invoices.chargeId, chargeId))
      .limit(1);
    if (
      invoice &&
      (invoice.status === "authorized" ||
        invoice.status === "scheduled" ||
        invoice.status === "synchronized")
    ) {
      return {
        error:
          "Esta cobrança tem nota fiscal autorizada ou em emissão — cancele a nota antes de excluir.",
      };
    }

    await db.delete(charges).where(eq(charges.id, chargeId));

    await logActivity({
      actorId: user.id,
      companyId: charge.companyId,
      entityType: "charge",
      entityId: chargeId,
      action: "charge.deleted",
      metadata: { description: charge.description },
    });

    revalidateFinance(charge.companyId);
    return { success: true };
  } catch (error) {
    return financeError(error);
  }
}

/**
 * Edita descrição, valor, meio de pagamento e vencimento da cobrança
 * (no Asaas e local). O Asaas só permite alterar cobranças
 * aguardando pagamento ou vencidas.
 */
export async function updateCharge(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = updateChargeSchema.parse(input);

    const valueCents = parseCurrencyToCents(data.value);
    if (valueCents === null || valueCents <= 0) {
      return { error: "Valor inválido (ex.: 1.500,00)." };
    }

    const [charge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, data.chargeId))
      .limit(1);
    if (!charge) return { error: "Cobrança não encontrada." };
    await assertCompanyAccess(user, charge.companyId);
    if (charge.status !== "pending" && charge.status !== "overdue") {
      return { error: "Só é possível editar cobranças em aberto." };
    }
    const unchanged =
      charge.description === data.description &&
      charge.billingType === data.billingType &&
      charge.dueDate === data.dueDate &&
      charge.valueCents === valueCents;
    if (unchanged) return { success: true };

    if (charge.asaasPaymentId) {
      await updatePayment({
        asaasPaymentId: charge.asaasPaymentId,
        billingType: data.billingType,
        valueCents,
        dueDate: data.dueDate,
        description: data.description,
      });
    }

    await db
      .update(charges)
      .set({
        description: data.description,
        billingType: data.billingType,
        valueCents,
        dueDate: data.dueDate,
        updatedAt: new Date(),
      })
      .where(eq(charges.id, data.chargeId));

    await logActivity({
      actorId: user.id,
      companyId: charge.companyId,
      entityType: "charge",
      entityId: data.chargeId,
      action: "charge.updated",
      metadata: { description: data.description },
    });

    revalidateFinance(charge.companyId);
    return { success: true };
  } catch (error) {
    return financeError(error);
  }
}

/** Gera cobrança a partir de um orçamento aprovado. */
export async function createChargeFromQuote(
  quoteId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = chargeFromQuoteSchema.parse(input);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Orçamento não encontrado." };
    await assertCompanyAccess(user, quote.companyId);
    if (quote.status !== "approved") {
      return { error: "Só é possível cobrar orçamento aprovado." };
    }

    const result = await generateChargeForQuote({
      quote,
      billingType: data.billingType,
      dueDate: data.dueDate,
      createdBy: user.id,
    });
    if (!result.ok) return { error: result.error };

    revalidateFinance(quote.companyId);
    revalidatePath(`/admin/orcamentos/${quoteId}`);
    return { success: true, id: result.chargeId };
  } catch (error) {
    return financeError(error);
  }
}

// ─────────────────────────── Serviços ativados (assinaturas) ───────────────────────────

/**
 * Ativa um serviço para a empresa:
 * - avulso → gera uma cobrança imediata
 * - recorrente → cria assinatura no Asaas (cobranças geradas a cada ciclo)
 */
export async function activateService(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = activateServiceSchema.parse(input);
    await assertCompanyAccess(user, data.companyId);

    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, data.serviceId))
      .limit(1);
    if (!service || !service.active) {
      return { error: "Serviço não encontrado ou inativo." };
    }

    let valueCents = service.defaultValueCents;
    if (data.value.trim()) {
      const parsed = parseCurrencyToCents(data.value);
      if (parsed === null || parsed <= 0) {
        return { error: "Valor inválido (ex.: 1.500,00)." };
      }
      valueCents = parsed;
    }

    if (service.billing === "one_time") {
      // Avulso: vira uma cobrança imediata
      const result = await createCharge({
        companyId: data.companyId,
        description: service.name,
        value: String(valueCents / 100).replace(".", ","),
        billingType: data.billingType,
        dueDate: data.firstDueDate,
      });
      return result;
    }

    // Recorrente: registro local primeiro (id = externalReference da assinatura)
    const [companyService] = await db
      .insert(companyServices)
      .values({
        companyId: data.companyId,
        serviceId: service.id,
        valueCents,
        billingType: data.billingType,
        createdBy: user.id,
      })
      .returning({ id: companyServices.id });

    try {
      const customerId = await ensureCustomer(data.companyId);
      const subscription = await createSubscription({
        customerId,
        billingType: data.billingType,
        valueCents,
        nextDueDate: data.firstDueDate,
        cycle: service.cycle,
        description: service.name,
        externalReference: companyService.id,
      });
      await db
        .update(companyServices)
        .set({ asaasSubscriptionId: subscription.id })
        .where(eq(companyServices.id, companyService.id));
    } catch (error) {
      await db
        .delete(companyServices)
        .where(eq(companyServices.id, companyService.id));
      throw error;
    }

    await logActivity({
      actorId: user.id,
      companyId: data.companyId,
      entityType: "service",
      entityId: companyService.id,
      action: "service.activated",
      metadata: {
        service: service.name,
        value: formatCurrency(valueCents),
        cycle: service.cycle,
      },
    });

    const recipients = await clientUsersOfCompany(data.companyId);
    await notifyUsers(recipients, {
      type: "service.activated",
      title: `Serviço ativado: ${service.name}`,
      body: `O serviço ${service.name} (${formatCurrency(valueCents)}/ciclo) foi ativado para a sua empresa. A primeira cobrança vence em ${formatDate(data.firstDueDate)}.`,
      href: "/portal/financeiro",
    });

    revalidateFinance(data.companyId);
    return { success: true, id: companyService.id };
  } catch (error) {
    return financeError(error);
  }
}

/** Cancela a assinatura (no Asaas e local). Cobranças já geradas permanecem. */
export async function deactivateService(
  companyServiceId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [companyService] = await db
      .select()
      .from(companyServices)
      .where(eq(companyServices.id, companyServiceId))
      .limit(1);
    if (!companyService) return { error: "Serviço não encontrado." };
    await assertCompanyAccess(user, companyService.companyId);
    if (companyService.status === "cancelled") return { success: true };

    if (companyService.asaasSubscriptionId) {
      await deleteSubscription(companyService.asaasSubscriptionId);
    }

    const [service] = await db
      .select({ name: services.name })
      .from(services)
      .where(eq(services.id, companyService.serviceId))
      .limit(1);

    await db
      .update(companyServices)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(companyServices.id, companyServiceId));

    await logActivity({
      actorId: user.id,
      companyId: companyService.companyId,
      entityType: "service",
      entityId: companyServiceId,
      action: "service.deactivated",
      metadata: { service: service?.name ?? "" },
    });

    revalidateFinance(companyService.companyId);
    return { success: true };
  } catch (error) {
    return financeError(error);
  }
}

/**
 * Emissão manual da NFS-e da cobrança (equipe), paga ou em aberto.
 * Idempotente; se a emissão anterior falhou ou foi cancelada, tenta novamente.
 */
export async function emitChargeInvoice(chargeId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [charge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1);
    if (!charge) return { error: "Cobrança não encontrada." };
    await assertCompanyAccess(user, charge.companyId);
    if (charge.status === "cancelled" || charge.status === "refunded") {
      return {
        error:
          "Cobranças canceladas ou estornadas não podem emitir nota fiscal.",
      };
    }

    // Retry: remove o registro de erro/cancelada anterior para emitir de novo
    const [failed] = await db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.chargeId, chargeId))
      .limit(1);
    if (failed && failed.status !== "error" && failed.status !== "canceled") {
      return { error: "Esta cobrança já possui nota fiscal emitida ou em emissão." };
    }
    if (failed) {
      await db.delete(invoices).where(eq(invoices.id, failed.id));
    }

    const result = await emitInvoiceForCharge(charge);
    if (!result.ok) {
      revalidateFinance(charge.companyId);
      return { error: result.error };
    }

    revalidateFinance(charge.companyId);
    return { success: true };
  } catch (error) {
    return financeError(error);
  }
}

/** Reenvia o e-mail/notificação da cobrança em aberto para o cliente. */
export async function resendChargeNotification(
  chargeId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [charge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, chargeId))
      .limit(1);
    if (!charge) return { error: "Cobrança não encontrada." };
    await assertCompanyAccess(user, charge.companyId);
    if (charge.status !== "pending" && charge.status !== "overdue") {
      return { error: "Só é possível reenviar cobranças em aberto." };
    }

    await notifyChargeReminder(charge);

    revalidateFinance(charge.companyId);
    return { success: true };
  } catch (error) {
    return financeError(error);
  }
}
