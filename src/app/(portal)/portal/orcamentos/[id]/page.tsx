import type { Metadata } from "next";
import { ArrowLeft, Download, Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteStatusChip } from "@/components/chips";
import { RespondQuoteButtons } from "@/components/quotes/respond-quote-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { getPortalQuote } from "@/lib/queries/portal";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercentBps,
  formatQuoteNumber,
} from "@/lib/utils/format";

export const metadata: Metadata = { title: "Orçamento" };

function formatQuantity(quantity: string): string {
  return Number(quantity).toLocaleString("pt-BR");
}

export default async function PortalQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  let detail;
  try {
    detail = await getPortalQuote(user, id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!detail) notFound();

  const { quote, items, responderName } = detail;
  const subtotalCents = quote.totalCents + quote.discountCents;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/portal/orcamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para orçamentos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">
            {formatQuoteNumber(quote.number)} · {quote.title}
          </h1>
          <QuoteStatusChip status={quote.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {quote.sentAt ? `Enviado em ${formatDate(quote.sentAt)}` : ""}
          {quote.validUntil
            ? ` · válido até ${formatDate(quote.validUntil)}`
            : ""}
        </p>
      </div>

      {quote.status === "sent" && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Revise os itens e valores abaixo e responda ao orçamento.
            </p>
            <RespondQuoteButtons quoteId={quote.id} />
          </CardContent>
        </Card>
      )}

      {(quote.status === "approved" || quote.status === "rejected") && (
        <Card>
          <CardContent className="space-y-1 py-4 text-sm">
            <p>
              Você {quote.status === "approved" ? "aprovou" : "recusou"} este
              orçamento
              {quote.respondedAt
                ? ` em ${formatDateTime(quote.respondedAt)}`
                : ""}
              {responderName ? ` (${responderName})` : ""}.
            </p>
            {quote.responseNote && (
              <p className="text-muted-foreground">
                Comentário: “{quote.responseNote}”
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Itens do orçamento</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Valor unit.</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right">
                  {formatQuantity(item.quantity)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.unitPriceCents)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(item.totalCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardContent className="space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotalCents)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>
              Desconto
              {quote.discountType === "percent" &&
                quote.discountPercentBps > 0 &&
                ` (${formatPercentBps(quote.discountPercentBps)})`}
            </span>
            <span>− {formatCurrency(quote.discountCents)}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{formatCurrency(quote.totalCents)}</span>
          </div>
        </CardContent>
      </Card>

      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {quote.notes}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={
            <a
              href={`/api/quotes/${quote.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <Eye />
          Ver PDF
        </Button>
        <Button
          variant="outline"
          render={
            <a href={`/api/quotes/${quote.id}/pdf?download=1`} download />
          }
        >
          <Download />
          Baixar PDF
        </Button>
      </div>
    </div>
  );
}
