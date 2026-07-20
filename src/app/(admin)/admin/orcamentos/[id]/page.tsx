import type { Metadata } from "next";
import { ArrowLeft, Download, Eye, FolderKanban, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChargeStatusChip, QuoteStatusChip } from "@/components/chips";
import { ChargeFromQuoteButton } from "@/components/finance/charge-from-quote-button";
import {
  CopyPublicLinkButton,
  CreateProjectButton,
  DeleteQuoteButton,
  DuplicateQuoteButton,
  SendQuoteButton,
} from "@/components/quotes/quote-actions";
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
import {
  assertCompanyAccess,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { getQuoteById } from "@/lib/queries/quotes";
import { getChargeByQuoteId } from "@/lib/queries/finance";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercentBps,
  formatQuoteNumber,
} from "@/lib/utils/format";
import { quoteStatusLabels } from "@/lib/validations/quote";

export const metadata: Metadata = { title: "Orçamento" };

function formatQuantity(quantity: string): string {
  return Number(quantity).toLocaleString("pt-BR");
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { id } = await params;
  const detail = await getQuoteById(id);
  if (!detail) notFound();
  await assertCompanyAccess(user, detail.quote.companyId);

  const { quote, items, company, creator, responder, project, origin } = detail;
  const charge =
    quote.status === "approved" ? await getChargeByQuoteId(quote.id) : null;
  const number = formatQuoteNumber(quote.number);
  const subtotalCents = quote.totalCents + quote.discountCents;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/orcamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para orçamentos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">
            {number} · {quote.title}
          </h1>
          {quote.version > 1 && (
            <span className="chip border-border bg-muted text-muted-foreground">
              v{quote.version}
            </span>
          )}
          <QuoteStatusChip status={quote.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {company.name} · criado em {formatDate(quote.createdAt)}
          {creator ? ` por ${creator.name}` : ""}
          {quote.sentAt ? ` · enviado em ${formatDate(quote.sentAt)}` : ""}
          {origin && (
            <>
              {" · duplicado de "}
              <Link
                href={`/admin/orcamentos/${origin.id}`}
                className="font-medium text-primary hover:underline"
              >
                {formatQuoteNumber(origin.number)}
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {quote.status === "draft" && (
          <>
            <SendQuoteButton quoteId={quote.id} quoteNumber={number} />
            <Button
              variant="outline"
              render={<Link href={`/admin/orcamentos/${quote.id}/editar`} />}
            >
              <Pencil />
              Editar
            </Button>
            <DeleteQuoteButton quoteId={quote.id} quoteNumber={number} />
          </>
        )}
        {quote.status !== "draft" && user.role === "super_admin" && (
          <DeleteQuoteButton
            quoteId={quote.id}
            quoteNumber={number}
            status={quote.status}
          />
        )}
        {quote.status === "approved" && !project && (
          <CreateProjectButton quoteId={quote.id} />
        )}
        {quote.status === "approved" && !charge && (
          <ChargeFromQuoteButton quoteId={quote.id} />
        )}
        {project && (
          <Button
            variant="outline"
            render={<Link href={`/admin/projetos/${project.id}`} />}
          >
            <FolderKanban />
            Ver projeto: {project.name}
          </Button>
        )}
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
        <DuplicateQuoteButton quoteId={quote.id} />
        {quote.status !== "draft" && (
          <CopyPublicLinkButton publicToken={quote.publicToken} />
        )}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Empresa</span>
              <Link
                href={`/admin/clientes/${company.id}`}
                className="font-medium text-primary hover:underline"
              >
                {company.name}
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Validade</span>
              <span>{formatDate(quote.validUntil)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span>{quoteStatusLabels[quote.status]}</span>
            </div>
          </CardContent>
        </Card>

        {(quote.status === "approved" || quote.status === "rejected") && (
          <Card>
            <CardHeader>
              <CardTitle>Resposta do cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Respondido por</span>
                <span>
                  {responder?.name ??
                    (quote.respondedName
                      ? `${quote.respondedName} (via link público)`
                      : "—")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Em</span>
                <span>{formatDateTime(quote.respondedAt)}</span>
              </div>
              {quote.responseNote && (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-muted-foreground">
                  “{quote.responseNote}”
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {charge && (
          <Card>
            <CardHeader>
              <CardTitle>Cobrança</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <ChargeStatusChip status={charge.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-medium">
                  {formatCurrency(charge.valueCents)}
                </span>
              </div>
              <Link
                href="/admin/financeiro"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Ver no financeiro
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

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
    </div>
  );
}
