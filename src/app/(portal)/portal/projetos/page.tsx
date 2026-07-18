import type { Metadata } from "next";
import { Calendar, FolderKanban } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusColorChip } from "@/components/chips";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { listPortalProjects } from "@/lib/queries/portal";
import { formatDate } from "@/lib/utils/format";
import { projectTypeLabels } from "@/lib/validations/project";

export const metadata: Metadata = { title: "Projetos" };

export default async function PortalProjectsPage() {
  const user = await requireUser();

  let projects;
  try {
    projects = await listPortalProjects(user);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Projetos</h1>
        <p className="text-sm text-muted-foreground">
          {projects.length === 1
            ? "1 projeto da sua empresa"
            : `${projects.length} projetos da sua empresa`}
        </p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderKanban className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhum projeto por aqui ainda</p>
            <p className="text-sm text-muted-foreground">
              Quando a equipe iniciar um projeto para você, ele aparece aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const percent =
              project.totalTasks > 0
                ? Math.round((project.doneTasks / project.totalTasks) * 100)
                : 0;
            return (
              <Link key={project.id} href={`/portal/projetos/${project.id}`}>
                <Card className="h-full transition-colors hover:border-[rgba(0,209,100,0.4)]">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{project.name}</CardTitle>
                      {project.status && (
                        <StatusColorChip
                          name={project.status.name}
                          color={project.status.color}
                        />
                      )}
                    </div>
                    <CardDescription>
                      {projectTypeLabels[project.type]}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Progress value={percent} className="flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {percent}%
                      </span>
                    </div>
                    <p className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {project.doneTasks} de {project.totalTasks} tarefas
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDate(project.dueDate)}
                      </span>
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
