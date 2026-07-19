import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { QuoteForm } from "@/components/quotes/quote-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  assertCompanyAccess,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { listCompanies } from "@/lib/queries/companies";
import { listActiveServices } from "@/lib/queries/finance";
import { getQuoteById } from "@/lib/queries/quotes";
import type { QuoteFormValues } from "@/lib/validations/quote";

export const metadata: Metadata = { title: "Editar orçamento" };

/** 123456 → "1.234,56" (formato dos inputs monetários do formulário). */
function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 1050 → "10,5" (input de percentual do formulário). */
function bpsToInput(bps: number): string {
  return (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { id } = await params;
  const [detail, companies, services] = await Promise.all([
    getQuoteById(id),
    listCompanies(user),
    listActiveServices(user),
  ]);
  if (!detail) notFound();
  await assertCompanyAccess(user, detail.quote.companyId);

  // Só rascunhos são editáveis — volta para o detalhe caso contrário
  if (detail.quote.status !== "draft") {
    redirect(`/admin/orcamentos/${id}`);
  }

  const { quote, items } = detail;
  const defaultValues: QuoteFormValues = {
    companyId: quote.companyId,
    title: quote.title,
    validUntil: quote.validUntil ?? "",
    discount:
      quote.discountType === "percent"
        ? quote.discountPercentBps > 0
          ? bpsToInput(quote.discountPercentBps)
          : ""
        : quote.discountCents > 0
          ? centsToInput(quote.discountCents)
          : "",
    discountType: quote.discountType,
    notes: quote.notes ?? "",
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity.replace(".", ","),
      unitPrice: centsToInput(item.unitPriceCents),
      serviceId: item.serviceId ?? "",
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link
          href={`/admin/orcamentos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para o orçamento
        </Link>
        <h1 className="text-2xl font-extrabold">Editar orçamento</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do orçamento</CardTitle>
          <CardDescription>
            Alterações são permitidas enquanto o orçamento estiver em
            rascunho.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuoteForm
            mode="edit"
            quoteId={quote.id}
            companies={companies.map((c) => ({
              id: c.id,
              name: c.nomeFantasia || c.razaoSocial,
            }))}
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              defaultValueCents: s.defaultValueCents,
            }))}
            defaultValues={defaultValues}
          />
        </CardContent>
      </Card>
    </div>
  );
}
