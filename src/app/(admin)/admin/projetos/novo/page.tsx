import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ProjectForm } from "@/components/projects/project-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listCompanies } from "@/lib/queries/companies";
import { listActiveProjectStatuses } from "@/lib/queries/projects";
import { listTeamSelectOptions } from "@/lib/queries/team";
import { listProjectTemplateOptions } from "@/lib/queries/templates";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string | string[] }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { empresa } = await searchParams;
  const defaultCompanyId = (Array.isArray(empresa) ? empresa[0] : empresa) ?? "";

  const [companies, statuses, teamUsers, templates] = await Promise.all([
    listCompanies(user),
    listActiveProjectStatuses(user),
    listTeamSelectOptions(user),
    listProjectTemplateOptions(user),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/projetos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para projetos
        </Link>
        <h1 className="text-2xl font-extrabold">Novo projeto</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do projeto</CardTitle>
          <CardDescription>
            Vincule o projeto a uma empresa e defina os dados iniciais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectForm
            mode="create"
            companies={companies.map((c) => ({
              id: c.id,
              name: c.nomeFantasia || c.razaoSocial,
            }))}
            statuses={statuses}
            teamUsers={teamUsers}
            templates={templates}
            defaultCompanyId={defaultCompanyId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
