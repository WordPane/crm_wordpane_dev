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
import { quoteStatusLabels, quoteStatuses } from "@/lib/validations/quote";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orçamentos" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

const STATUS_ORDER: Quote["status"][] = [
  "draft",
  "requested",
  "sent",
  "approved",
  "rejected",
];

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

  const [allItems, companies] = await Promise.all([
    listQuotes(user, {
      companyId: companyId || undefined,
    }),
    listCompanies(user),
  ]);

  const items = status
    ? allItems.filter((q) => q.status === status)
    : allItems;

  const companyOptions = companies.map((c) => ({
    id: c.id,
    name: c.nomeFantasia || c.razaoSocial,
  }));

  function filterHref(nextStatus: string, nextCompany = companyId): string {
    const qs = new URLSearchParams();
    if (nextStatus) qs.set("status", nextStatus);
    if (nextCompany) qs.set("empresa", nextCompany);
    const str = qs.toString();
    return str ? `/admin/orcamentos?${str}` : "/admin/orcamentos";
  }

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
            {status ? ` em ${quoteStatusLabels[status].toLowerCase()}` : ""}
          </p>
        </div>
        <Button render={<Link href="/admin/orcamentos/novo" />}>
          <Plus />
          Novo orçamento
        </Button>
      </div>

      {/* Resumo por status */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Link
          href={filterHref("")}
          className={cn(
            "rounded-xl border bg-card p-3 text-center transition-colors hover:border-primary/30",
            !status && "ring-2 ring-primary/30",
          )}
        >
          <p className="text-xs text-muted-foreground">Todos</p>
          <p className="text-xl font-extrabold">{allItems.length}</p>
        </Link>
        {STATUS_ORDER.map((s) => {
          const count = allItems.filter((q) => q.status === s).length;
          const active = status === s;
          return (
            <Link
              key={s}
              href={filterHref(s)}
              className={cn(
                "rounded-xl border bg-card p-3 text-center transition-colors hover:border-primary/30",
                active && "ring-2 ring-primary/30",
              )}
            >
              <p className="text-xs text-muted-foreground">
                {quoteStatusLabels[s]}
              </p>
              <p className="text-xl font-extrabold">{count}</p>
            </Link>
          );
        })}
      </div>

      <QuoteFilters
        status={status}
        companyId={companyId}
        companies={companyOptions}
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
        <>
          {/* Desktop: tabela */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap pl-4">
                      Nº
                    </TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="whitespace-nowrap text-right">
                      Valor
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">
                      Validade
                    </TableHead>
                    <TableHead className="whitespace-nowrap pr-4">
                      Criado em
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((quote) => (
                    <TableRow
                      key={quote.id}
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell className="whitespace-nowrap pl-4 font-mono text-xs">
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
                      <TableCell className="whitespace-nowrap text-right font-medium">
                        {formatCurrency(quote.totalCents)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <QuoteStatusChip status={quote.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(quote.validUntil)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-muted-foreground">
                        {formatDate(quote.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Mobile: cards */}
          <div className="grid gap-3 md:hidden">
            {items.map((quote) => (
              <Link
                key={quote.id}
                href={`/admin/orcamentos/${quote.id}`}
                className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">
                      {quote.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {quote.company.name}
                    </p>
                  </div>
                  <QuoteStatusChip status={quote.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Nº</p>
                    <p className="font-mono text-xs">
                      {formatQuoteNumber(quote.number)}
                      {quote.version > 1 && (
                        <span className="ml-1 text-muted-foreground">
                          v{quote.version}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Valor</p>
                    <p className="font-medium">
                      {formatCurrency(quote.totalCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Validade</p>
                    <p className="text-muted-foreground">
                      {formatDate(quote.validUntil)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Criado em</p>
                    <p className="text-muted-foreground">
                      {formatDate(quote.createdAt)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
