import { format } from "date-fns";
import { eq } from "drizzle-orm";

import {
  createInvoice,
  downloadInvoiceFile,
} from "@/lib/asaas/client";
import { db } from "@/lib/db";
import { charges, invoices, type Charge } from "@/lib/db/schema";
import { getIssuer } from "@/lib/issuer";
import {
  clientUsersOfCompany,
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { getStorage } from "@/lib/storage";
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

    const [invoice] = await db
      .insert(invoices)
      .values({ chargeId: charge.id, status: "scheduled" })
      .returning({ id: invoices.id });

    try {
      const created = await createInvoice({
        paymentId: charge.asaasPaymentId,
        description: charge.description,
        valueCents: charge.valueCents,
        effectiveDate: format(new Date(), "yyyy-MM-dd"),
        serviceCode: issuer.serviceCode,
        serviceName: issuer.serviceName,
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
 * INVOICE_AUTHORIZED: baixa o PDF e o XML para o storage interno
 * (acesso imediato e autenticado) e notifica equipe + cliente.
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

  const storage = getStorage();
  let pdfKey = invoice.pdfKey;
  let xmlKey = invoice.xmlKey;

  if (payload.pdfUrl && !pdfKey) {
    const pdf = await downloadInvoiceFile(payload.pdfUrl);
    pdfKey = (await storage.put(`invoices/${invoice.id}.pdf`, pdf, "application/pdf")).fileKey;
  }
  if (payload.xmlUrl && !xmlKey) {
    const xml = await downloadInvoiceFile(payload.xmlUrl);
    xmlKey = (await storage.put(`invoices/${invoice.id}.xml`, xml, "application/xml")).fileKey;
  }

  await db
    .update(invoices)
    .set({
      status: "authorized",
      number: payload.number != null ? String(payload.number) : null,
      pdfKey,
      xmlKey,
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
