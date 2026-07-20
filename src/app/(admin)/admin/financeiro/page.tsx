import type { Metadata } from "next";
import { Plus, Wallet } from "lucide-react";
import Link from "next/link";

import { ChargeStatusChip } from "@/components/chips";
import { CancelChargeButton } from "@/components/finance/cancel-charge-button";
import { ChargeFilters } from "@/components/finance/charge-filters";
import { DownloadInvoicesButton } from "@/components/finance/download-invoices-button";
import { EditChargeButton } from "@/components/finance/edit-charge-button";
import { EmitInvoiceButton } from "@/components/finance/emit-invoice-button";
import { ResendChargeButton } from "@/components/finance/resend-charge-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import type { Charge } from "@/lib/db/schema";
import { listCompanies } from "@/lib/queries/companies";
import { financeSummary, listCharges } from "@/lib/queries/finance";
import { formatCurrency, formatDate, isOverdue } from "@/lib/utils/format";
import { parsePeriod } from "@/lib/utils/period";
import {
  chargeBillingTypeLabels,
  chargeStatuses,
} from "@/lib/validations/finance";

export const metadata: Metadata = { title: "Financeiro" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    empresa?: string | string[];
    periodo?: string | string[];
    base?: string | string[];
  }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const params = await searchParams;
  const statusParam = first(params.status);
  const status = (chargeStatuses as readonly string[]).includes(statusParam)
    ? (statusParam as Charge["status"])
    : "";
  const companyId = first(params.empresa);
  const periodo = first(params.periodo);
  const base = first(params.base) === "pagamento" ? "pagamento" : "";

  const [items, summary, companies] = await Promise.all([
    listCharges(user, {
      status: status || undefined,
      companyId: companyId || undefined,
      period: parsePeriod(periodo || undefined) ?? undefined,
      dateBase: base === "pagamento" ? "pagamento" : "vencimento",
    }),
    financeSummary(user),
    listCompanies(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Cobranças enviadas ao Asaas e serviços ativados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href="/admin/financeiro/servicos" />}
          >
            <Wallet />
            Serviços
          </Button>
          <Button render={<Link href="/admin/financeiro/nova" />}>
            <Plus />
            Nova cobrança
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Em aberto</p>
            <p className="text-xl font-extrabold">
              {formatCurrency(summary.openCents)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.openCount}{" "}
              {summary.openCount === 1 ? "cobrança" : "cobranças"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Vencidas</p>
            <p className="text-xl font-extrabold text-red-300">
              {summary.overdueCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.overdueCount === 1
                ? "cobrança vencida"
                : "cobranças vencidas"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Recebido no mês</p>
            <p className="text-xl font-extrabold text-primary">
              {formatCurrency(summary.receivedThisMonthCents)}
            </p>
            <p className="text-xs text-muted-foreground">pagos e confirmados</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChargeFilters
          status={status}
          companyId={companyId}
          periodo={periodo}
          base={base}
          companies={companies.map((c) => ({
            id: c.id,
            name: c.nomeFantasia || c.razaoSocial,
          }))}
        />
        <DownloadInvoicesButton />
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Wallet className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhuma cobrança encontrada</p>
            <p className="text-sm text-muted-foreground">
              {status || companyId || periodo
                ? "Ajuste os filtros para ver mais resultados."
                : "Crie a primeira cobrança para um cliente."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((charge) => (
                <TableRow key={charge.id}>
                  <TableCell className="max-w-64">
                    <span className="block truncate font-medium">
                      {charge.description}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {charge.company.name}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(charge.valueCents)}
                  </TableCell>
                  <TableCell
                    className={
                      charge.status === "pending" && isOverdue(charge.dueDate)
                        ? "text-red-300"
                        : "text-muted-foreground"
                    }
                  >
                    {formatDate(charge.dueDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {chargeBillingTypeLabels[charge.billingType]}
                  </TableCell>
                  <TableCell>
                    <ChargeStatusChip status={charge.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {charge.invoice?.status === "authorized" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            render={
                              <a
                                href={`/api/invoices/${charge.invoice.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                              />
                            }
                          >
                            NF PDF
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            render={
                              <a
                                href={`/api/invoices/${charge.invoice.id}/xml`}
                                target="_blank"
                                rel="noreferrer"
                              />
                            }
                          >
                            XML
                          </Button>
                        </>
                      )}
                      {(charge.invoice?.status === "scheduled" ||
                        charge.invoice?.status === "synchronized") && (
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          NF emitindo...
                        </span>
                      )}
                      {charge.invoice?.status === "error" && (
                        <span
                          className="text-xs whitespace-nowrap text-red-300"
                          title={charge.invoice.errorMessage ?? ""}
                        >
                          NF com erro
                        </span>
                      )}
                      {charge.invoice?.status === "canceled" && (
                        <span className="text-xs whitespace-nowrap text-muted-foreground">
                          NF cancelada
                        </span>
                      )}
                      {charge.status !== "cancelled" &&
                        charge.status !== "refunded" &&
                        (!charge.invoice ||
                          charge.invoice.status === "error" ||
                          charge.invoice.status === "canceled") && (
                          <EmitInvoiceButton
                            chargeId={charge.id}
                            paid={
                              charge.status === "received" ||
                              charge.status === "confirmed"
                            }
                          />
                        )}
                      {charge.invoiceUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          render={
                            <a
                              href={charge.invoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                            />
                          }
                        >
                          Fatura
                        </Button>
                      )}
                      {(charge.status === "pending" ||
                        charge.status === "overdue") && (
                        <>
                          <EditChargeButton
                            chargeId={charge.id}
                            description={charge.description}
                            valueCents={charge.valueCents}
                            billingType={charge.billingType}
                            currentDueDate={charge.dueDate}
                          />
                          <ResendChargeButton chargeId={charge.id} />
                          <CancelChargeButton
                            chargeId={charge.id}
                            description={charge.description}
                          />
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
