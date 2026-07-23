import { addDays, format, parseISO } from "date-fns";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { createPayment, deletePayment, ensureCustomer } from "@/lib/asaas/client";
import { db } from "@/lib/db";
import {
  charges,
  maintenancePlans,
  projectPlans,
} from "@/lib/db/schema";
import { emitInvoiceForNewCharge } from "@/lib/invoices";
import { clientUsersOfCompany, notifyUsers } from "@/lib/notifications";
import { applyDuePlanRollovers } from "@/lib/queries/maintenance";
import { businessToday, formatCurrency } from "@/lib/utils/format";

/**
 * GET /api/cron/planos-manutencao — aplica o rollover das instâncias avulsas
 * (one_time) com ciclo vencido e gera a cobrança do ciclo que ficou
 * `pending_payment`. 1x ao dia.
 * Protegido pelo header Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const today = businessToday();

  // Rollover primeiro: o faturamento não depende de alguém ler o saldo
  await applyDuePlanRollovers(today);

  const instances = await db
    .select({ projectPlan: projectPlans, plan: maintenancePlans })
    .from(projectPlans)
    .innerJoin(maintenancePlans, eq(projectPlans.planId, maintenancePlans.id))
    .where(
      and(
        eq(projectPlans.billingMode, "one_time"),
        inArray(projectPlans.status, ["pending_payment"]),
        or(
          isNull(projectPlans.lastBilledPeriodStart),
          lt(projectPlans.lastBilledPeriodStart, projectPlans.currentPeriodStart),
        ),
      ),
    )
    .limit(100);

  let billed = 0;
  for (const { projectPlan: instance, plan } of instances) {
    try {
      const periodStart = instance.currentPeriodStart;
      const cycleLabel = format(parseISO(periodStart), "MM/yyyy");
      const description = `Plano de manutenção "${plan.name}" — ciclo ${cycleLabel}`;
      const dueDate = format(addDays(parseISO(today), 3), "yyyy-MM-dd");

      const [charge] = await db
        .insert(charges)
        .values({
          companyId: instance.companyId,
          projectPlanId: instance.id,
          description,
          valueCents: plan.valueCents,
          billingType: "undefined",
          dueDate,
          createdBy: null,
        })
        .returning({ id: charges.id });

      let asaasPaymentId: string | null = null;
      try {
        const customerId = await ensureCustomer(instance.companyId);
        const payment = await createPayment({
          customerId,
          billingType: "undefined",
          valueCents: plan.valueCents,
          dueDate,
          description,
          externalReference: charge.id,
        });
        asaasPaymentId = payment.id;
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

      // Guarda atômica de idempotência: só prossegue quem marcar o ciclo
      // como faturado primeiro; a execução perdedora desfaz a cobrança
      // duplicada que acabou de criar (duas execuções simultâneas não
      // podem faturar o mesmo ciclo duas vezes)
      const [claimed] = await db
        .update(projectPlans)
        .set({ lastBilledPeriodStart: periodStart, updatedAt: new Date() })
        .where(
          and(
            eq(projectPlans.id, instance.id),
            or(
              isNull(projectPlans.lastBilledPeriodStart),
              lt(projectPlans.lastBilledPeriodStart, periodStart),
            ),
          ),
        )
        .returning({ id: projectPlans.id });
      if (!claimed) {
        if (asaasPaymentId) {
          try {
            await deletePayment(asaasPaymentId);
          } catch (error) {
            // Best-effort: a cobrança duplicada pode restar no Asaas —
            // o espelho local é removido de qualquer forma
            console.error(
              `Falha ao cancelar cobrança duplicada ${asaasPaymentId} no Asaas:`,
              error,
            );
          }
        }
        await db.delete(charges).where(eq(charges.id, charge.id));
        continue;
      }

      await emitInvoiceForNewCharge(instance.companyId, charge.id);

      const clients = await clientUsersOfCompany(instance.companyId);
      await notifyUsers(clients, {
        type: "plan.renewal_charge",
        title: `Fatura do plano: ciclo ${cycleLabel}`,
        body: `A cobrança de ${formatCurrency(plan.valueCents)} do plano "${plan.name}" foi gerada. Quite para liberar as demandas do ciclo.`,
        href: "/portal/financeiro",
      });

      billed += 1;
    } catch (error) {
      console.error(
        `Falha ao faturar o ciclo do plano ${instance.id}:`,
        error,
      );
    }
  }

  return NextResponse.json({ ok: true, billed, checked: instances.length });
}
