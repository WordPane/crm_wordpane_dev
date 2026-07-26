import { and, eq, ne, sql } from "drizzle-orm";

import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import {
  charges,
  companies,
  companyServices,
  projectPlanPackages,
  projectPlanProjects,
  projectPlans,
  type Charge,
} from "@/lib/db/schema";
import {
  cancelInvoiceForCharge,
  emitInvoiceForCharge,
  emitInvoiceForNewCharge,
} from "@/lib/invoices";
import {
  clientUsersOfCompany,
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { formatCurrency, formatDate } from "@/lib/utils/format";

/**
 * Núcleo do processamento de eventos de cobrança do Asaas, compartilhado
 * pelo webhook (`/api/webhooks/asaas`, eventos em tempo real) e pelo cron
 * de reconciliação (`/api/cron/reconciliar-pagamentos`, que deriva o tipo
 * de evento do status atual consultado na API do Asaas).
 */

export type WebhookPayment = {
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
  /** Datas reais do pagamento no Asaas (reconciliação registra o dia certo). */
  paymentDate?: string | null;
  confirmedDate?: string | null;
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

/**
 * Espelho local de cobrança gerada por assinatura (company_service ou plano
 * de manutenção recurring): cria se ainda não existir, notifica o cliente e
 * emite NF conforme a configuração da empresa. Usado no PAYMENT_CREATED e
 * quando a confirmação/recebimento chega ANTES dele (evento fora de ordem,
 * comum com cartão aprovado na hora). Instância de plano cancelada não gera
 * espelho: o cancelamento da assinatura no Asaas é best-effort e ciclos
 * tardios de um plano cancelado não devem faturar nem notificar.
 */
async function ensureSubscriptionChargeMirror(
  payment: WebhookPayment,
): Promise<Charge | null> {
  const existing = await findCharge(payment);
  if (existing) return existing;
  if (!payment.subscription) return null;

  const [companyService] = await db
    .select()
    .from(companyServices)
    .where(eq(companyServices.asaasSubscriptionId, payment.subscription))
    .limit(1);

  // Assinatura de plano de manutenção (recurring) também gera espelho
  const [planInstance] = companyService
    ? [undefined]
    : await db
        .select()
        .from(projectPlans)
        .where(
          and(
            eq(projectPlans.asaasSubscriptionId, payment.subscription),
            ne(projectPlans.status, "cancelled"),
          ),
        )
        .limit(1);

  const ownerCompanyId = companyService?.companyId ?? planInstance?.companyId;
  if (!ownerCompanyId) return null;

  const valueCents = Math.round((payment.value ?? 0) * 100);
  const [newCharge] = await db
    .insert(charges)
    .values({
      companyId: ownerCompanyId,
      companyServiceId: companyService?.id ?? null,
      projectPlanId: planInstance?.id ?? null,
      description: payment.description ?? "Cobrança de assinatura",
      valueCents,
      billingType: BILLING_TYPE_REVERSE[payment.billingType ?? ""] ?? "undefined",
      dueDate: payment.dueDate ?? new Date().toISOString().slice(0, 10),
      status: "pending",
      asaasPaymentId: payment.id,
      invoiceUrl: payment.invoiceUrl ?? null,
      bankSlipUrl: payment.bankSlipUrl ?? null,
      createdBy: null,
    })
    .returning();

  const recipients = await clientUsersOfCompany(ownerCompanyId);
  await notifyUsers(recipients, {
    type: "charge.created",
    title: `Nova cobrança: ${payment.description ?? "Assinatura"}`,
    body: `Uma cobrança recorrente no valor de ${formatCurrency(valueCents)} com vencimento em ${formatDate(payment.dueDate)} foi gerada.`,
    href: "/portal/financeiro",
  });

  // Emissão automática para empresas que emitem NF junto com a cobrança
  await emitInvoiceForNewCharge(ownerCompanyId, newCharge.id);

  return newCharge;
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

/**
 * Pacote de manutenção comprado no portal segue o destino da cobrança:
 * pagamento confirmado → créditos ativos; excluída/estornada → cancelado.
 */
async function syncPackageWithCharge(chargeId: string, event: string) {
  const [pkg] = await db
    .select({
      id: projectPlanPackages.id,
      name: projectPlanPackages.name,
      status: projectPlanPackages.status,
      projectPlanId: projectPlanPackages.projectPlanId,
    })
    .from(projectPlanPackages)
    .where(eq(projectPlanPackages.chargeId, chargeId))
    .limit(1);
  if (!pkg) return;

  if (
    (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") &&
    pkg.status === "pending_payment"
  ) {
    await db
      .update(projectPlanPackages)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(projectPlanPackages.id, pkg.id));

    const [instance] = await db
      .select({ companyId: projectPlans.companyId })
      .from(projectPlans)
      .where(eq(projectPlans.id, pkg.projectPlanId))
      .limit(1);
    if (instance) {
      // href para o primeiro projeto coberto (fallback: lista de demandas)
      const [covered] = await db
        .select({ projectId: projectPlanProjects.projectId })
        .from(projectPlanProjects)
        .where(eq(projectPlanProjects.projectPlanId, pkg.projectPlanId))
        .limit(1);
      const clients = await clientUsersOfCompany(instance.companyId);
      await notifyUsers(clients, {
        type: "plan.package_activated",
        title: `Pacote "${pkg.name}" ativado`,
        body: "Pagamento confirmado — os créditos do pacote já estão disponíveis nos projetos do seu plano.",
        href: covered
          ? `/portal/projetos/${covered.projectId}`
          : "/portal/demandas",
      });
    }
    return;
  }

  if (
    (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") &&
    pkg.status !== "cancelled"
  ) {
    await db
      .update(projectPlanPackages)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectPlanPackages.id, pkg.id));
  }
}

/**
 * Instância de plano de manutenção vinculada à cobrança (ativação/renovação):
 * pago → ativa; atrasou → bloqueia e avisa a equipe; excluída/estornada →
 * cancela, mesmo se já tinha ativado (estorno/chargeback desfaz a ativação).
 */
async function syncPlanInstanceWithCharge(
  charge: Charge,
  event: string,
): Promise<void> {
  if (!charge.projectPlanId) return;
  const [instance] = await db
    .select()
    .from(projectPlans)
    .where(eq(projectPlans.id, charge.projectPlanId))
    .limit(1);
  if (!instance) return;

  if (
    (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") &&
    instance.status === "pending_payment"
  ) {
    await db
      .update(projectPlans)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(projectPlans.id, instance.id));
    const clients = await clientUsersOfCompany(instance.companyId);
    await notifyUsers(clients, {
      type: "plan.activated",
      title: "Plano de manutenção ativo",
      body: "Pagamento confirmado — a cota do ciclo já está disponível nos projetos do seu plano.",
      href: "/portal/plano",
    });
    return;
  }

  if (
    event === "PAYMENT_OVERDUE" &&
    (instance.status === "active" || instance.status === "pending_payment")
  ) {
    // Renovação avulsa (one_time) já está pending_payment quando a fatura
    // vence — só a instância ativa muda de status; a equipe é avisada nos
    // dois casos (a renovação em atraso também precisa de acompanhamento)
    if (instance.status === "active") {
      await db
        .update(projectPlans)
        .set({ status: "pending_payment", updatedAt: new Date() })
        .where(eq(projectPlans.id, instance.id));
    }
    const team = await teamUsersOfCompany(instance.companyId);
    await notifyUsers(team, {
      type: "plan.payment_overdue",
      title: "Plano de manutenção em atraso",
      body: `A cobrança "${charge.description}" venceu sem pagamento — as demandas do cliente foram bloqueadas até a quitação.`,
      href: `/admin/clientes/${instance.companyId}?tab=manutencao`,
    });
    return;
  }

  if (
    (event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") &&
    instance.status !== "cancelled"
  ) {
    await db
      .update(projectPlans)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(projectPlans.id, instance.id));
  }
}

/**
 * Aplica um evento de cobrança (PAYMENT_*) ao estado local: atualiza o
 * status da cobrança, notifica, emite/cancela NF conforme o caso e sincroniza
 * pacotes e instâncias de plano vinculados. Exceções sobem para o chamador
 * (webhook → 5xx para reentrega; cron → conta como erro no relatório).
 */
export async function processPaymentEvent(
  event: string,
  payment: WebhookPayment,
): Promise<void> {
  // Cobrança nova gerada por assinatura → cria espelho local
  if (event === "PAYMENT_CREATED" && payment.subscription) {
    await ensureSubscriptionChargeMirror(payment);
    return;
  }

  let charge: Charge | null = await findCharge(payment);
  if (
    !charge &&
    (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED")
  ) {
    // Evento fora de ordem (cartão aprovado na hora): cria o espelho a
    // partir do payload do evento e segue o processamento normalmente
    charge = await ensureSubscriptionChargeMirror(payment);
  }
  if (!charge) {
    // Cobrança criada fora do CRM — ignoramos (não é nossa)
    console.warn(`Webhook ${event}: cobrança ${payment.id} não encontrada.`);
    return;
  }

  switch (event) {
    case "PAYMENT_CONFIRMED": {
      await setChargeStatus(charge.id, "confirmed");
      break;
    }
    case "PAYMENT_RECEIVED": {
      // Data real do pagamento quando disponível (reconciliação de eventos
      // perdidos registra o dia em que o cliente pagou, não o dia do sync)
      const paidAtRaw = payment.confirmedDate ?? payment.paymentDate;
      const paidAt =
        paidAtRaw && !Number.isNaN(Date.parse(paidAtRaw))
          ? new Date(paidAtRaw)
          : new Date();
      await setChargeStatus(charge.id, "received", paidAt);
      const [company] = await db
        .select({
          name: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
          invoiceEmission: companies.invoiceEmission,
        })
        .from(companies)
        .where(eq(companies.id, charge.companyId))
        .limit(1);
      await logActivity({
        actorId: null,
        companyId: charge.companyId,
        entityType: "charge",
        entityId: charge.id,
        action: "charge.received",
        metadata: {
          description: charge.description,
          value: formatCurrency(charge.valueCents),
          company: company?.name ?? null,
        },
      });
      const team = await teamUsersOfCompany(charge.companyId);
      await notifyUsers(team, {
        type: "charge.received",
        title: `Cobrança paga: ${charge.description}`,
        body: `O pagamento de ${formatCurrency(charge.valueCents)} foi confirmado pelo Asaas.`,
        href: "/admin/financeiro",
      });
      // Emite a NFS-e após o pagamento quando a empresa está configurada
      // para isso (best-effort, não bloqueia o processamento)
      if (company?.invoiceEmission === "apos_pagamento") {
        await emitInvoiceForCharge(charge);
      }
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
      // Não deixar NF autorizada órfã de uma cobrança excluída no Asaas
      await cancelInvoiceForCharge(charge.id);
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

  // Pacote de manutenção vinculado à cobrança (se houver) acompanha o evento
  if (
    event === "PAYMENT_CONFIRMED" ||
    event === "PAYMENT_RECEIVED" ||
    event === "PAYMENT_DELETED" ||
    event === "PAYMENT_REFUNDED"
  ) {
    await syncPackageWithCharge(charge.id, event);
  }

  // Instância de plano vinculada à cobrança: ativa, bloqueia ou cancela
  if (
    event === "PAYMENT_CONFIRMED" ||
    event === "PAYMENT_RECEIVED" ||
    event === "PAYMENT_OVERDUE" ||
    event === "PAYMENT_DELETED" ||
    event === "PAYMENT_REFUNDED"
  ) {
    await syncPlanInstanceWithCharge(charge, event);
  }
}
