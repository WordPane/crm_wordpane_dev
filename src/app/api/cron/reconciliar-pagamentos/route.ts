import { and, asc, inArray, isNotNull, lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getInvoice, getPayment } from "@/lib/asaas/client";
import { processPaymentEvent } from "@/lib/asaas/process-payment-event";
import { db } from "@/lib/db";
import { charges, invoices, type Charge } from "@/lib/db/schema";
import {
  processInvoiceAuthorized,
  processInvoiceCanceled,
  processInvoiceError,
} from "@/lib/invoices";

/**
 * GET /api/cron/reconciliar-pagamentos — reconciliação diária com o Asaas.
 * A confirmação de pagamento e os eventos de NFS-e chegam pelo webhook;
 * se um evento se perder (endpoint fora do ar, timeout, falha de
 * processamento, fila pausada), o estado local ficaria errado para
 * sempre. Este cron consulta o status real no Asaas das cobranças em
 * aberto e das notas aguardando autorização, aplicando as MESMAS
 * transições do webhook (processPaymentEvent / processInvoice*).
 * Disparado pelo Vercel Cron (vercel.json), 1x ao dia às 11:40 UTC (8h40
 * BRT) — antes do cron de lembretes, para não lembrar quem já pagou.
 * Protegido pelo header Authorization: Bearer $CRON_SECRET.
 */

/** Status atual no Asaas → evento equivalente do webhook. */
const ASAAS_TO_EVENT: Record<string, string> = {
  RECEIVED: "PAYMENT_RECEIVED",
  CONFIRMED: "PAYMENT_CONFIRMED",
  OVERDUE: "PAYMENT_OVERDUE",
  REFUNDED: "PAYMENT_REFUNDED",
  DELETED: "PAYMENT_DELETED",
};

/** Status locais em que o evento não muda nada (evita notificação duplicada). */
const SKIP_WHEN_LOCAL: Record<string, Charge["status"][]> = {
  PAYMENT_RECEIVED: ["received", "refunded", "cancelled"],
  PAYMENT_CONFIRMED: ["confirmed", "received", "refunded", "cancelled"],
  PAYMENT_OVERDUE: ["overdue", "received", "refunded", "cancelled"],
  PAYMENT_REFUNDED: ["refunded"],
  PAYMENT_DELETED: ["cancelled"],
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // Só cobranças com algumas horas de vida — não disputa com o webhook
  // os eventos que ainda estão em voo
  const graceThreshold = new Date(Date.now() - 6 * 3600 * 1000);
  const openCharges = await db
    .select()
    .from(charges)
    .where(
      and(
        inArray(charges.status, ["pending", "overdue"]),
        isNotNull(charges.asaasPaymentId),
        lt(charges.createdAt, graceThreshold),
      ),
    )
    .orderBy(asc(charges.createdAt))
    .limit(100);

  let synced = 0;
  let skipped = 0;
  const errors: { chargeId: string; error: string }[] = [];

  for (const charge of openCharges) {
    const asaasPaymentId = charge.asaasPaymentId;
    if (!asaasPaymentId) continue;
    try {
      const payment = await getPayment(asaasPaymentId);
      const asaasStatus = payment.deleted ? "DELETED" : (payment.status ?? "");
      const event = ASAAS_TO_EVENT[asaasStatus];
      if (!event || SKIP_WHEN_LOCAL[event]?.includes(charge.status)) {
        skipped += 1;
        continue;
      }
      await processPaymentEvent(event, payment);
      synced += 1;
      console.log(
        `Reconciliação: cobrança ${charge.id} (${charge.status}) ← ${event}`,
      );
    } catch (error) {
      console.error(`Reconciliação: falha na cobrança ${charge.id}:`, error);
      errors.push({
        chargeId: charge.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // NFS-e: notas aguardando autorização cujo evento INVOICE_* se perdeu
  // (fila de webhook pausada) ficariam "scheduled" para sempre
  const pendingInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        inArray(invoices.status, ["scheduled", "synchronized"]),
        isNotNull(invoices.asaasInvoiceId),
        lt(invoices.createdAt, graceThreshold),
      ),
    )
    .orderBy(asc(invoices.createdAt))
    .limit(100);

  let invoicesSynced = 0;
  const invoiceErrors: { invoiceId: string; error: string }[] = [];

  for (const invoice of pendingInvoices) {
    const asaasInvoiceId = invoice.asaasInvoiceId;
    if (!asaasInvoiceId) continue;
    try {
      const remote = await getInvoice(asaasInvoiceId);
      switch (remote.status) {
        case "AUTHORIZED":
          await processInvoiceAuthorized({
            id: remote.id,
            number: remote.number,
            pdfUrl: remote.pdfUrl,
            xmlUrl: remote.xmlUrl,
          });
          invoicesSynced += 1;
          break;
        case "ERROR":
          await processInvoiceError({
            id: remote.id,
            message: remote.statusDescription,
          });
          invoicesSynced += 1;
          break;
        case "CANCELED":
          await processInvoiceCanceled({ id: remote.id });
          invoicesSynced += 1;
          break;
        default:
          break; // ainda agendada/processando no Asaas
      }
    } catch (error) {
      console.error(`Reconciliação: falha na nota ${invoice.id}:`, error);
      invoiceErrors.push({
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: openCharges.length,
    synced,
    skipped,
    errors,
    invoicesChecked: pendingInvoices.length,
    invoicesSynced,
    invoiceErrors,
  });
}
