import type { Metadata } from "next";
import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";

import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listCompanies } from "@/lib/queries/companies";
import { listActiveProjectStatuses, listProjects } from "@/lib/queries/projects";

export const metadata: Metadata = { title: "Projetos" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    empresa?: string | string[];
  }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const params = await searchParams;
  const search = first(params.q);
  const statusId = first(params.status);
  const companyId = first(params.empresa);

  const [items, statuses, companies] = await Promise.all([
    listProjects(user, { search, statusId, companyId }),
    listActiveProjectStatuses(user),
    listCompanies(user),
  ]);

  const companyOptions = companies.map((c) => ({
    id: c.id,
    name: c.nomeFantasia || c.razaoSocial,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            {items.length}{" "}
            {items.length === 1
              ? "projeto encontrado"
              : "projetos encontrados"}
            {search && <> para &ldquo;{search}&rdquo;</>}
          </p>
        </div>
        <Button render={<Link href="/admin/projetos/novo" />}>
          <Plus />
          Novo projeto
        </Button>
      </div>

      <ProjectFilters
        search={search}
        statusId={statusId}
        companyId={companyId}
        statuses={statuses}
        companies={companyOptions}
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderKanban className="size-12 text-muted-foreground/40" />
            {search || statusId || companyId ? (
              <>
                <p className="font-medium">Nenhum projeto encontrado</p>
                <p className="text-sm text-muted-foreground">
                  Ajuste os filtros ou a busca para ver mais resultados.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Nenhum projeto cadastrado ainda</p>
                <p className="text-sm text-muted-foreground">
                  Crie o primeiro projeto para começar a execução.
                </p>
                <Button
                  render={<Link href="/admin/projetos/novo" />}
                  className="mt-2"
                >
                  <Plus />
                  Novo projeto
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <ProjectsTable items={items} />
        </div>
      )}
    </div>
  );
}
