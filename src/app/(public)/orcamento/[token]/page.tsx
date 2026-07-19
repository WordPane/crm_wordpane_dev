import type { Metadata } from "next";
import { Download, Eye } from "lucide-react";
import { notFound } from "next/navigation";

import { QuoteStatusChip } from "@/components/chips";
import { RespondQuotePublic } from "@/components/quotes/respond-quote-public";
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
import { brandAssetUrl } from "@/lib/brand/config";
import { getBranding } from "@/lib/brand/settings";
import { getQuoteByToken } from "@/lib/queries/quotes";
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

/** Página pública do orçamento (link com token, sem login). */
export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const detail = await getQuoteByToken(token);
  if (!detail) notFound();

  const brand = await getBranding();

  const { quote, items, company } = detail;
  const number = formatQuoteNumber(quote.number);
  const subtotalCents = quote.totalCents + quote.discountCents;
  const pdfUrl = `/api/quotes/${quote.id}/pdf?token=${quote.publicToken}`;

  return (
    <main className="hero-glow min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brandAssetUrl(brand, "logo")}
            alt={brand.appName}
            className="h-8 w-auto"
          />
          <p className="text-sm text-muted-foreground">
            Orçamento para {company.name}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold">
              {number} · {quote.title}
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

        <Card>
          <CardContent className="py-5">
            {quote.status === "sent" ? (
              <RespondQuotePublic token={quote.publicToken} />
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  Este orçamento foi{" "}
                  {quote.status === "approved" ? "aprovado" : "recusado"}
                  {quote.respondedName ? ` por ${quote.respondedName}` : ""}
                  {quote.respondedAt
                    ? ` em ${formatDateTime(quote.respondedAt)}`
                    : ""}
                  .
                </p>
                {quote.responseNote && (
                  <p className="text-muted-foreground">
                    Comentário: “{quote.responseNote}”
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<a href={pdfUrl} target="_blank" rel="noreferrer" />}
          >
            <Eye />
            Ver PDF
          </Button>
          <Button
            variant="outline"
            render={<a href={`${pdfUrl}&download=1`} download />}
          >
            <Download />
            Baixar PDF
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} {brand.appName} — Gestão de clientes e
          projetos
        </p>
      </div>
    </main>
  );
}
