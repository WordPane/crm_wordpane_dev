import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ChargeForm } from "@/components/finance/charge-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listCompanies } from "@/lib/queries/companies";

export const metadata: Metadata = { title: "Nova cobrança" };

export default async function NewChargePage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string | string[] }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { empresa } = await searchParams;
  const defaultCompanyId = (Array.isArray(empresa) ? empresa[0] : empresa) ?? "";

  const companies = await listCompanies(user);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/financeiro"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para o financeiro
        </Link>
        <h1 className="text-2xl font-extrabold">Nova cobrança</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da cobrança</CardTitle>
          <CardDescription>
            A cobrança é criada no Asaas imediatamente e o cliente é notificado
            por e-mail com o link de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChargeForm
            companies={companies.map((c) => ({
              id: c.id,
              name: c.nomeFantasia || c.razaoSocial,
            }))}
            defaultCompanyId={defaultCompanyId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
