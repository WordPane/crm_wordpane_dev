import type { Metadata } from "next";
import { ExternalLink, Wallet } from "lucide-react";
import { notFound } from "next/navigation";

import { ChargeStatusChip } from "@/components/chips";
import { PixQrDialog } from "@/components/finance/pix-qr-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import type { PortalChargeItem } from "@/lib/queries/portal";
import {
  listPortalCharges,
  listPortalSubscriptions,
} from "@/lib/queries/portal";
import { formatCurrency, formatDate, isOverdue } from "@/lib/utils/format";
import {
  chargeBillingTypeLabels,
  subscriptionCycleLabels,
} from "@/lib/validations/finance";

export const metadata: Metadata = { title: "Financeiro" };

function ChargeRow({ charge }: { charge: PortalChargeItem }) {
  const overdue = charge.status === "overdue";
  return (
    <li className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {charge.description}
        </span>
        <ChargeStatusChip status={charge.status} />
        {overdue && (
          <span className="chip border-red-400/30 bg-red-400/10 text-red-300">
            Vencida
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="text-sm font-medium text-foreground">
          {formatCurrency(charge.valueCents)}
        </span>
        <span>Vence em {formatDate(charge.dueDate)}</span>
        <span>{chargeBillingTypeLabels[charge.billingType]}</span>
        {charge.status === "pending" &&
          !overdue &&
          isOverdue(charge.dueDate) && (
            <span className="text-red-300">em atraso</span>
          )}
      </div>
      {(charge.status === "pending" || charge.status === "overdue") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {charge.invoiceUrl && (
            <Button
              size="sm"
              render={
                <a href={charge.invoiceUrl} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink />
              Pagar agora
            </Button>
          )}
          {charge.billingType === "pix" && charge.asaasPaymentId && (
            <PixQrDialog chargeId={charge.id} />
          )}
          {charge.billingType === "boleto" && charge.bankSlipUrl && (
            <Button
              variant="outline"
              size="sm"
              render={
                <a href={charge.bankSlipUrl} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink />
              Baixar boleto
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export default async function PortalFinancePage() {
  const user = await requireUser();

  let charges;
  let subscriptions;
  try {
    [charges, subscriptions] = await Promise.all([
      listPortalCharges(user),
      listPortalSubscriptions(user),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const open = charges.filter(
    (c) => c.status === "pending" || c.status === "overdue",
  );
  const paid = charges.filter(
    (c) => c.status === "received" || c.status === "confirmed",
  );
  const others = charges.filter(
    (c) => c.status === "cancelled" || c.status === "refunded",
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Suas cobranças, assinaturas e pagamentos.
        </p>
      </div>

      {charges.length === 0 && subscriptions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Wallet className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhuma cobrança por aqui ainda</p>
            <p className="text-sm text-muted-foreground">
              Quando a equipe gerar uma cobrança, ela aparece nesta página e
              você recebe um aviso por e-mail.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Em aberto</h2>
            {open.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma cobrança em aberto. 🎉
              </p>
            ) : (
              <ul className="space-y-2">
                {open.map((charge) => (
                  <ChargeRow key={charge.id} charge={charge} />
                ))}
              </ul>
            )}
          </section>

          {subscriptions.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Assinaturas ativas</h2>
              <ul className="space-y-2">
                {subscriptions.map((sub) => (
                  <li
                    key={sub.id}
                    className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {sub.serviceName}
                      </span>
                      <span className="chip">
                        {subscriptionCycleLabels[sub.serviceCycle]}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(sub.valueCents)}
                        <span className="text-xs font-normal text-muted-foreground">
                          /{sub.serviceCycle === "monthly" ? "mês" : "ciclo"}
                        </span>
                      </span>
                      <span>{chargeBillingTypeLabels[sub.billingType]}</span>
                      <span>desde {formatDate(sub.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {paid.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Pagas</h2>
              <ul className="space-y-2">
                {paid.map((charge) => (
                  <li
                    key={charge.id}
                    className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {charge.description}
                      </span>
                      <ChargeStatusChip status={charge.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(charge.valueCents)}
                      </span>
                      <span>Paga em {formatDate(charge.paidAt)}</span>
                      <span>{chargeBillingTypeLabels[charge.billingType]}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Canceladas e estornadas</h2>
              <ul className="space-y-2">
                {others.map((charge) => (
                  <li
                    key={charge.id}
                    className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 opacity-60"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {charge.description}
                      </span>
                      <ChargeStatusChip status={charge.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatCurrency(charge.valueCents)}</span>
                      <span>Vencia em {formatDate(charge.dueDate)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
