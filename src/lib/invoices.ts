import { format } from "date-fns";
import { eq } from "drizzle-orm";

import { cancelInvoice, createInvoice, ensureCustomer } from "@/lib/asaas/client";
import { db } from "@/lib/db";
import {
  charges,
  companies,
  companyServices,
  invoices,
  quoteItems,
  services,
  type Charge,
} from "@/lib/db/schema";
import { getIssuer } from "@/lib/issuer";
import {
  clientUsersOfCompany,
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Emite a NFS-e da cobrança paga (idempotente: 1 NF por cobrança).
 * Erros ficam registrados na própria nota e também retornados —
 * o webhook ignora o retorno; a emissão manual o exibe ao usuário.
 */
export async function emitInvoiceForCharge(
  charge: Charge,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!charge.asaasPaymentId) {
      return { ok: false, error: "Cobrança sem vínculo com o Asaas." };
    }

    const [existing] = await db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.chargeId, charge.id))
      .limit(1);
    if (existing) {
      return existing.status === "error"
        ? { ok: false, error: "Já existe uma nota com erro para esta cobrança." }
        : { ok: true };
    }

    const issuer = await getIssuer();

    // Código do serviço: o do serviço vinculado à cobrança (assinatura),
    // ou o padrão do emissor quando não houver vínculo/código específico
    let serviceCode = issuer.serviceCode;
    let serviceName = issuer.serviceName;
    if (charge.companyServiceId) {
      const [linked] = await db
        .select({
          serviceCode: services.serviceCode,
          serviceName: services.name,
        })
        .from(companyServices)
        .innerJoin(services, eq(companyServices.serviceId, services.id))
        .where(eq(companyServices.id, charge.companyServiceId))
        .limit(1);
      if (linked?.serviceCode) serviceCode = linked.serviceCode;
      if (linked?.serviceName) serviceName = linked.serviceName;
    } else if (charge.quoteId) {
      // Cobrança de orçamento: usa o código se TODOS os itens com
      // catálogo forem do mesmo serviço; senão, padrão do emissor
      const rows = await db
        .select({
          code: services.serviceCode,
          name: services.name,
        })
        .from(quoteItems)
        .innerJoin(services, eq(quoteItems.serviceId, services.id))
        .where(eq(quoteItems.quoteId, charge.quoteId));
      const codes = [
        ...new Set(rows.map((r) => r.code).filter((c): c is string => !!c)),
      ];
      if (codes.length === 1) {
        serviceCode = codes[0];
        serviceName =
          rows.find((r) => r.code === codes[0])?.name ?? serviceName;
      }
    }

    const [invoice] = await db
      .insert(invoices)
      .values({ chargeId: charge.id, status: "scheduled" })
      .returning({ id: invoices.id });

    try {
      // Sincroniza o cadastro do cliente no Asaas antes de emitir: o
      // endereço (exigido na NFS-e) pode ter sido corrigido após a cobrança
      await ensureCustomer(charge.companyId);
      const created = await createInvoice({
        paymentId: charge.asaasPaymentId,
        description: charge.description,
        valueCents: charge.valueCents,
        effectiveDate: format(new Date(), "yyyy-MM-dd"),
        serviceCode,
        serviceName,
      });
      await db
        .update(invoices)
        .set({ asaasInvoiceId: created.id, updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido.";
      await db
        .update(invoices)
        .set({ status: "error", errorMessage: message, updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));
      console.error(`Falha ao emitir NF da cobrança ${charge.id}:`, error);
      return { ok: false, error: message };
    }
  } catch (error) {
    console.error(`Falha ao preparar NF da cobrança ${charge.id}:`, error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
    };
  }
}

/**
 * Emissão automática "junto com a cobrança": se a empresa está configurada
 * para isso, emite a NFS-e assim que a cobrança é criada. Best-effort —
 * erros ficam registrados na própria nota para retentativa manual.
 */
export async function emitInvoiceForNewCharge(
  companyId: string,
  chargeId: string,
): Promise<void> {
  const [company] = await db
    .select({ invoiceEmission: companies.invoiceEmission })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (company?.invoiceEmission !== "junto_cobranca") return;

  const [charge] = await db
    .select()
    .from(charges)
    .where(eq(charges.id, chargeId))
    .limit(1);
  if (!charge) return;

  await emitInvoiceForCharge(charge);
}

/**
 * Cancela a NFS-e da cobrança (se houver), no Asaas e local.
 * Sem nota, já cancelada ou com erro → ok. Falha no Asaas → ok:false,
 * e o chamador decide se aborta a operação que motivou o cancelamento.
 */
export async function cancelInvoiceForCharge(
  chargeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.chargeId, chargeId))
    .limit(1);
  if (
    !invoice ||
    invoice.status === "canceled" ||
    invoice.status === "error"
  ) {
    return { ok: true };
  }

  if (!invoice.asaasInvoiceId) {
    // Nunca chegou ao Asaas — só marca localmente
    await db
      .update(invoices)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));
    return { ok: true };
  }

  try {
    await cancelInvoice(invoice.asaasInvoiceId);
    await db
      .update(invoices)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(invoices.id, invoice.id));
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido.";
    console.error(`Falha ao cancelar NF da cobrança ${chargeId}:`, error);
    return { ok: false, error: message };
  }
}

/**
 * INVOICE_AUTHORIZED: grava número e URLs oficiais do Asaas
 * (PDF/XML são servidos pelo próprio Asaas — nada é armazenado localmente)
 * e notifica equipe + cliente.
 */
export async function processInvoiceAuthorized(payload: {
  id: string;
  number?: string | number | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
}): Promise<void> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.asaasInvoiceId, payload.id))
    .limit(1);
  if (!invoice || invoice.status === "authorized") return;

  await db
    .update(invoices)
    .set({
      status: "authorized",
      number: payload.number != null ? String(payload.number) : null,
      asaasPdfUrl: payload.pdfUrl ?? null,
      asaasXmlUrl: payload.xmlUrl ?? null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoice.id));

  const [charge] = await db
    .select()
    .from(charges)
    .where(eq(charges.id, invoice.chargeId))
    .limit(1);
  if (!charge) return;

  const [team, clients] = await Promise.all([
    teamUsersOfCompany(charge.companyId),
    clientUsersOfCompany(charge.companyId),
  ]);
  await notifyUsers(team, {
    type: "invoice.authorized",
    title: `Nota fiscal emitida: ${charge.description}`,
    body: `A nota fiscal de ${formatCurrency(charge.valueCents)} foi autorizada pela prefeitura.`,
    href: "/admin/financeiro",
  });
  await notifyUsers(clients, {
    type: "invoice.authorized",
    title: `Nota fiscal disponível: ${charge.description}`,
    body: `A nota fiscal de ${formatCurrency(charge.valueCents)} já está disponível em PDF e XML no seu portal.`,
    href: "/portal/financeiro",
  });
}

/** INVOICE_ERROR: marca a nota como erro e avisa a equipe. */
export async function processInvoiceError(payload: {
  id: string;
  message?: string | null;
}): Promise<void> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.asaasInvoiceId, payload.id))
    .limit(1);
  if (!invoice) return;

  const message = payload.message ?? "Erro na emissão da nota fiscal.";
  await db
    .update(invoices)
    .set({ status: "error", errorMessage: message, updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id));

  const [charge] = await db
    .select()
    .from(charges)
    .where(eq(charges.id, invoice.chargeId))
    .limit(1);
  if (!charge) return;

  const team = await teamUsersOfCompany(charge.companyId);
  await notifyUsers(team, {
    type: "invoice.error",
    title: `Falha ao emitir nota fiscal: ${charge.description}`,
    body: message,
    href: "/admin/financeiro",
  });
}

/** INVOICE_CANCELED: marca a nota como cancelada. */
export async function processInvoiceCanceled(payload: {
  id: string;
}): Promise<void> {
  await db
    .update(invoices)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(invoices.asaasInvoiceId, payload.id));
}
