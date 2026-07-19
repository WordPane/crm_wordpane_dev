import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activities";
import { getAsaasSettings } from "@/lib/asaas/settings";
import { db } from "@/lib/db";
import {
  charges,
  companyServices,
  webhookEvents,
  type Charge,
} from "@/lib/db/schema";
import {
  clientUsersOfCompany,
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { formatCurrency, formatDate } from "@/lib/utils/format";

/**
 * POST /api/webhooks/asaas — eventos de cobrança do Asaas.
 * Validação: header `asaas-access-token` = webhookToken da configuração.
 * Entrega at-least-once: dedup por id do evento em webhook_events.
 * Docs: https://docs.asaas.com/docs/webhook-para-cobrancas
 */

type WebhookPayment = {
  id: string;
  externalReference?: string | null;
  subscription?: string | null;
  status?: string;
  value?: number;
  dueDate?: string;
  description?: string;
  billingType?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

type WebhookEvent = {
  id?: string;
  event?: string;
  payment?: WebhookPayment;
};

const BILLING_TYPE_REVERSE: Record<string, Charge["billingType"]> = {
  PIX: "pix",
  BOLETO: "boleto",
  CREDIT_CARD: "credit_card",
};

/** Localiza a cobrança local: externalReference (charge.id) → fallback asaasPaymentId. */
async function findCharge(payment: WebhookPayment) {
  if (payment.externalReference) {
    const [charge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, payment.externalReference))
      .limit(1);
    if (charge) return charge;
  }
  const [charge] = await db
    .select()
    .from(charges)
    .where(eq(charges.asaasPaymentId, payment.id))
    .limit(1);
  return charge ?? null;
}

async function setChargeStatus(
  chargeId: string,
  status: Charge["status"],
  paidAt?: Date,
) {
  await db
    .update(charges)
    .set({ status, paidAt: paidAt ?? null, updatedAt: new Date() })
    .where(eq(charges.id, chargeId));
}

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
  if (!body?.id || !body.event || !body.payment?.id) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  // Dedup: evento já processado (onConflictDoNothing — sem exceção)
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: body.id })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const payment = body.payment;

  try {
    // Cobrança nova gerada por assinatura → cria espelho local
    if (body.event === "PAYMENT_CREATED" && payment.subscription) {
      const [companyService] = await db
        .select()
        .from(companyServices)
        .where(eq(companyServices.asaasSubscriptionId, payment.subscription))
        .limit(1);

      if (companyService) {
        const existing = await findCharge(payment);
        if (!existing) {
          const valueCents = Math.round((payment.value ?? 0) * 100);
          await db.insert(charges).values({
            companyId: companyService.companyId,
            companyServiceId: companyService.id,
            description: payment.description ?? "Cobrança de assinatura",
            valueCents,
            billingType: BILLING_TYPE_REVERSE[payment.billingType ?? ""] ?? "undefined",
            dueDate: payment.dueDate ?? new Date().toISOString().slice(0, 10),
            status: "pending",
            asaasPaymentId: payment.id,
            invoiceUrl: payment.invoiceUrl ?? null,
            bankSlipUrl: payment.bankSlipUrl ?? null,
            createdBy: null,
          });

          const recipients = await clientUsersOfCompany(
            companyService.companyId,
          );
          await notifyUsers(recipients, {
            type: "charge.created",
            title: `Nova cobrança: ${payment.description ?? "Assinatura"}`,
            body: `Uma cobrança recorrente no valor de ${formatCurrency(valueCents)} com vencimento em ${formatDate(payment.dueDate)} foi gerada.`,
            href: "/portal/financeiro",
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    const charge = await findCharge(payment);
    if (!charge) {
      // Cobrança criada fora do CRM — ignoramos (não é nossa)
      console.warn(`Webhook ${body.event}: cobrança ${payment.id} não encontrada.`);
      return NextResponse.json({ received: true });
    }

    switch (body.event) {
      case "PAYMENT_CONFIRMED": {
        await setChargeStatus(charge.id, "confirmed");
        break;
      }
      case "PAYMENT_RECEIVED": {
        await setChargeStatus(charge.id, "received", new Date());
        await logActivity({
          actorId: null,
          companyId: charge.companyId,
          entityType: "charge",
          entityId: charge.id,
          action: "charge.received",
          metadata: {
            description: charge.description,
            value: formatCurrency(charge.valueCents),
          },
        });
        const team = await teamUsersOfCompany(charge.companyId);
        await notifyUsers(team, {
          type: "charge.received",
          title: `Cobrança paga: ${charge.description}`,
          body: `O pagamento de ${formatCurrency(charge.valueCents)} foi confirmado pelo Asaas.`,
          href: "/admin/financeiro",
        });
        break;
      }
      case "PAYMENT_OVERDUE": {
        await setChargeStatus(charge.id, "overdue");
        const clients = await clientUsersOfCompany(charge.companyId);
        await notifyUsers(clients, {
          type: "charge.overdue",
          title: `Cobrança vencida: ${charge.description}`,
          body: `A cobrança de ${formatCurrency(charge.valueCents)} venceu em ${formatDate(charge.dueDate)} e ainda está em aberto.`,
          href: "/portal/financeiro",
        });
        break;
      }
      case "PAYMENT_DELETED": {
        await setChargeStatus(charge.id, "cancelled");
        break;
      }
      case "PAYMENT_REFUNDED": {
        await setChargeStatus(charge.id, "refunded");
        break;
      }
      default: {
        // Demais eventos (updated, viewed etc.) não mudam o estado local
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Erro ao processar webhook ${body.event} (${body.id}):`, error);
    // 200 mesmo assim: o evento já ficou registrado e não deve ser reenviado
    return NextResponse.json({ received: true, processed: false });
  }
}
