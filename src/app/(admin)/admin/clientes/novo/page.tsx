import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { CompanyForm } from "@/components/companies/company-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewCompanyPage() {
  const user = await requireUser();
  requireTeam(user);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para clientes
        </Link>
        <h1 className="text-2xl font-extrabold">Novo cliente</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre uma empresa cliente. Apenas a razão social é obrigatória.
        </p>
      </div>

      <Card>
        <CardContent>
          <CompanyForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
