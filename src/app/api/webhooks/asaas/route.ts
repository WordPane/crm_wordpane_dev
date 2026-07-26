import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getAsaasSettings } from "@/lib/asaas/settings";
import {
  processPaymentEvent,
  type WebhookPayment,
} from "@/lib/asaas/process-payment-event";
import { db } from "@/lib/db";
import { webhookEvents, webhookFailedEvents } from "@/lib/db/schema";
import {
  processInvoiceAuthorized,
  processInvoiceCanceled,
  processInvoiceError,
} from "@/lib/invoices";

/**
 * POST /api/webhooks/asaas — eventos de cobrança do Asaas.
 * Validação: header `asaas-access-token` = webhookToken da configuração.
 * Entrega at-least-once: o id do evento só é gravado em webhook_events
 * APÓS o processamento — falhas retornam 5xx e o Asaas reentrega.
 * O processamento de eventos de cobrança (PAYMENT_*) vive em
 * `@/lib/asaas/process-payment-event`, compartilhado com o cron de
 * reconciliação (/api/cron/reconciliar-pagamentos).
 * Docs: https://docs.asaas.com/docs/webhook-para-cobrancas
 */

type WebhookInvoice = {
  id: string;
  number?: string | number | null;
  pdfUrl?: string | null;
  xmlUrl?: string | null;
  statusDescription?: string | null;
};

type WebhookEvent = {
  id?: string;
  event?: string;
  payment?: WebhookPayment;
  invoice?: WebhookInvoice;
};

export async function POST(request: Request) {
  const settings = await getAsaasSettings();
  if (!settings) {
    console.error("Webhook Asaas recebido sem configuração ativa.");
    return NextResponse.json(
      { error: "Asaas não configurado." },
      { status: 503 },
    );
  }

  const token = request.headers.get("asaas-access-token");
  if (token !== settings.webhookToken) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as WebhookEvent | null;
  if (!body?.id || !body.event || (!body.payment?.id && !body.invoice?.id)) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  // Dedup: o id do evento só é gravado em webhook_events APÓS o
  // processamento bem-sucedido — em erro, 5xx para o Asaas reentregar
  // (entrega at-least-once; um evento perdido não é reprocessado depois).
  const [processed] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.id, body.id))
    .limit(1);
  if (processed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await processEvent(body);
  } catch (error) {
    console.error(`Erro ao processar webhook ${body.event} (${body.id}):`, error);
    // Guarda o evento falho para diagnóstico (best-effort — não pode
    // impedir o 5xx que sinaliza a reentrega ao Asaas)
    try {
      await db
        .insert(webhookFailedEvents)
        .values({
          id: body.id,
          event: body.event ?? null,
          payload: body,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .onConflictDoNothing();
    } catch (logError) {
      console.error("Falha ao registrar evento de webhook com erro:", logError);
    }
    return NextResponse.json(
      { error: "Falha ao processar o evento." },
      { status: 500 },
    );
  }

  // Marca como processado; se uma entrega duplicada concorrente gravou
  // primeiro, a violação de unique é absorvida (evento já processado)
  await db.insert(webhookEvents).values({ id: body.id }).onConflictDoNothing();

  return NextResponse.json({ received: true });
}

/** Processa o evento validado. Qualquer exceção vira 5xx (reentrega). */
async function processEvent(body: WebhookEvent): Promise<void> {
  const event = body.event ?? "";

  // Eventos de nota fiscal (NFS-e)
  if (event.startsWith("INVOICE_") && body.invoice) {
    switch (event) {
      case "INVOICE_AUTHORIZED":
        await processInvoiceAuthorized(body.invoice);
        break;
      case "INVOICE_ERROR":
        await processInvoiceError({
          id: body.invoice.id,
          message: body.invoice.statusDescription,
        });
        break;
      case "INVOICE_CANCELED":
        await processInvoiceCanceled({ id: body.invoice.id });
        break;
      default:
        break;
    }
    return;
  }

  // Evento de cobrança sem payment válido — nada a fazer
  if (!body.payment) return;

  await processPaymentEvent(event, body.payment);
}
