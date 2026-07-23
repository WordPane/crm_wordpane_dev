import type { Metadata } from "next";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { QuoteStatusChip } from "@/components/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import { listPortalQuotes } from "@/lib/queries/portal";
import {
  formatCurrency,
  formatDate,
  formatQuoteNumber,
} from "@/lib/utils/format";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function PortalQuotesPage() {
  const user = await requireUser();
  const brand = await getBranding();

  let quotes;
  try {
    quotes = await listPortalQuotes(user);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Propostas enviadas pela equipe {brand.appName} para a sua empresa.
          </p>
        </div>
        <Button render={<Link href="/portal/orcamentos/nova" />}>
          <Plus />
          Solicitar orçamento
        </Button>
      </div>

      {quotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhum orçamento disponível</p>
            <p className="text-sm text-muted-foreground">
              Quando a equipe enviar um orçamento, ele aparece aqui e você
              recebe um aviso por e-mail.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/portal/orcamentos/${quote.id}`}
                className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:ring-foreground/20"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatQuoteNumber(quote.number)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {quote.title}
                  </span>
                  <QuoteStatusChip status={quote.status} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="text-sm font-medium text-foreground">
                    {quote.status === "requested"
                      ? "Aguardando proposta"
                      : formatCurrency(quote.totalCents)}
                  </span>
                  {quote.sentAt && (
                    <span>Enviado em {formatDate(quote.sentAt)}</span>
                  )}
                  {quote.validUntil && (
                    <span>Válido até {formatDate(quote.validUntil)}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
