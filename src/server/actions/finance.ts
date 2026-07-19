"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
} from "@/lib/asaas/client";
import { db } from "@/lib/db";
import {
  charges,
  companyServices,
  invoices,
  quotes,
  services,
} from "@/lib/db/schema";
import { emitInvoiceForCharge } from "@/lib/invoices";
import {
  clientUsersOfCompany,
  notifyChargeReminder,
  notifyUsers,
} from "@/lib/notifications";
import {
  formatCurrency,
  formatDate,
  formatQuoteNumber,
} from "@/lib/utils/format";
import {
  activateServiceSchema,
  chargeFormSchema,
  chargeFromQuoteSchema,
  serviceFormSchema,
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

/** Notifica os usuários da empresa sobre uma nova cobrança. */
async function notifyChargeCreated(
  companyId: string,
  description: string,
  valueCents: number,
  dueDate: string,
) {
  const recipients = await clientUsersOfCompany(companyId);
  await notifyUsers(recipients, {
    type: "charge.created",
    title: `Nova cobrança: ${description}`,
    body: `Uma cobrança no valor de ${formatCurrency(valueCents)} com vencimento em ${formatDate(dueDate)} foi gerada para a sua empresa.`,
    href: "/portal/financeiro",
    rows: [
      { label: "Descrição", value: description },
      { label: "Valor", value: formatCurrency(valueCents) },
      { label: "Vencimento", value: formatDate(dueDate) },
    ],
  });
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

    const [existing] = await db
      .select({ id: charges.id })
      .from(charges)
      .where(eq(charges.quoteId, quoteId))
      .limit(1);
    if (existing) {
      return { error: "Este orçamento já possui uma cobrança." };
    }

    const number = formatQuoteNumber(quote.number);
    const description = `${number} — ${quote.title}`;

    const [charge] = await db
      .insert(charges)
      .values({
        companyId: quote.companyId,
        quoteId,
        description,
        valueCents: quote.totalCents,
        billingType: data.billingType,
        dueDate: data.dueDate,
        createdBy: user.id,
      })
      .returning({ id: charges.id });

    try {
      const customerId = await ensureCustomer(quote.companyId);
      const payment = await createPayment({
        customerId,
        billingType: data.billingType,
        valueCents: quote.totalCents,
        dueDate: data.dueDate,
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

    await logActivity({
      actorId: user.id,
      companyId: quote.companyId,
      entityType: "charge",
      entityId: charge.id,
      action: "charge.created",
      metadata: {
        description,
        value: formatCurrency(quote.totalCents),
        quote: number,
      },
    });
    await notifyChargeCreated(
      quote.companyId,
      description,
      quote.totalCents,
      data.dueDate,
    );

    revalidateFinance(quote.companyId);
    revalidatePath(`/admin/orcamentos/${quoteId}`);
    return { success: true, id: charge.id };
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
 * Emissão manual da NFS-e de uma cobrança paga (equipe).
 * Idempotente; se a emissão anterior falhou, tenta novamente.
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
    if (charge.status !== "received" && charge.status !== "confirmed") {
      return { error: "A nota fiscal só pode ser emitida após o pagamento." };
    }

    // Retry: remove o registro de erro anterior para emitir de novo
    const [failed] = await db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.chargeId, chargeId))
      .limit(1);
    if (failed && failed.status !== "error") {
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
