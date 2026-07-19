import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { QuoteForm } from "@/components/quotes/quote-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listCompanies } from "@/lib/queries/companies";
import { listActiveServices } from "@/lib/queries/finance";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string | string[] }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { empresa } = await searchParams;
  const defaultCompanyId = (Array.isArray(empresa) ? empresa[0] : empresa) ?? "";

  const [companies, services] = await Promise.all([
    listCompanies(user),
    listActiveServices(user),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/orcamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para orçamentos
        </Link>
        <h1 className="text-2xl font-extrabold">Novo orçamento</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do orçamento</CardTitle>
          <CardDescription>
            O orçamento é criado como rascunho e só fica visível ao cliente
            após o envio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuoteForm
            mode="create"
            companies={companies.map((c) => ({
              id: c.id,
              name: c.nomeFantasia || c.razaoSocial,
            }))}
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              defaultValueCents: s.defaultValueCents,
            }))}
            defaultCompanyId={defaultCompanyId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
