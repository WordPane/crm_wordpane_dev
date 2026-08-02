import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { notFound } from "next/navigation";

import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Card, CardContent } from "@/components/ui/card";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import {
  listPortalProjects,
  listPortalProjectStatuses,
} from "@/lib/queries/portal";

export const metadata: Metadata = { title: "Projetos" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function PortalProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    concluidas?: string | string[];
  }>;
}) {
  const user = await requireUser();

  const params = await searchParams;
  const search = first(params.q);
  const statusId = first(params.status);
  const showDone = first(params.concluidas) === "sim";

  let projects, statuses;
  try {
    [projects, statuses] = await Promise.all([
      listPortalProjects(user, { search, statusId, hideCompleted: !showDone }),
      listPortalProjectStatuses(user),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Projetos</h1>
        <p className="text-sm text-muted-foreground">
          {projects.length}{" "}
          {projects.length === 1
            ? "projeto encontrado"
            : "projetos encontrados"}
          {search && <> para &ldquo;{search}&rdquo;</>}
        </p>
      </div>

      <ProjectFilters
        search={search}
        statusId={statusId}
        showDone={showDone}
        statuses={statuses}
      />

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderKanban className="size-12 text-muted-foreground/40" />
            {search || statusId ? (
              <>
                <p className="font-medium">Nenhum projeto encontrado</p>
                <p className="text-sm text-muted-foreground">
                  Ajuste os filtros ou a busca para ver mais resultados.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Nenhum projeto por aqui ainda</p>
                <p className="text-sm text-muted-foreground">
                  Quando a equipe iniciar um projeto para você, ele aparece
                  aqui.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <ProjectsTable
            items={projects}
            showCompany={false}
            hrefBase="/portal/projetos"
          />
        </div>
      )}
    </div>
  );
}
