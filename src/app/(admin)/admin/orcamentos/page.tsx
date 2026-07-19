import type { Metadata } from "next";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { QuoteStatusChip } from "@/components/chips";
import { QuoteFilters } from "@/components/quotes/quote-filters";
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
import type { Quote } from "@/lib/db/schema";
import { listCompanies } from "@/lib/queries/companies";
import { listQuotes } from "@/lib/queries/quotes";
import {
  formatCurrency,
  formatDate,
  formatQuoteNumber,
} from "@/lib/utils/format";
import { quoteStatuses } from "@/lib/validations/quote";

export const metadata: Metadata = { title: "Orçamentos" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    empresa?: string | string[];
  }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const params = await searchParams;
  const statusParam = first(params.status);
  const status = (quoteStatuses as readonly string[]).includes(statusParam)
    ? (statusParam as Quote["status"])
    : "";
  const companyId = first(params.empresa);

  const [items, companies] = await Promise.all([
    listQuotes(user, {
      status: status || undefined,
      companyId: companyId || undefined,
    }),
    listCompanies(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            {items.length}{" "}
            {items.length === 1
              ? "orçamento encontrado"
              : "orçamentos encontrados"}
          </p>
        </div>
        <Button render={<Link href="/admin/orcamentos/novo" />}>
          <Plus />
          Novo orçamento
        </Button>
      </div>

      <QuoteFilters
        status={status}
        companyId={companyId}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.nomeFantasia || c.razaoSocial,
        }))}
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhum orçamento encontrado</p>
            <p className="text-sm text-muted-foreground">
              {status || companyId
                ? "Ajuste os filtros para ver mais resultados."
                : "Crie o primeiro orçamento para um cliente."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/admin/orcamentos/${quote.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {formatQuoteNumber(quote.number)}
                    </Link>
                    {quote.version > 1 && (
                      <span className="ml-1 text-muted-foreground">
                        v{quote.version}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/orcamentos/${quote.id}`}
                      className="font-medium hover:underline"
                    >
                      {quote.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {quote.company.name}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(quote.totalCents)}
                  </TableCell>
                  <TableCell>
                    <QuoteStatusChip status={quote.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(quote.validUntil)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(quote.createdAt)}
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
