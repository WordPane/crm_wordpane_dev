import type { Metadata } from "next";
import { Calendar, FolderKanban, Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusColorChip } from "@/components/chips";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { getPortalCompany, getPortalDashboard } from "@/lib/queries/portal";
import { formatDate } from "@/lib/utils/format";
import { projectTypeLabels } from "@/lib/validations/project";

export const metadata: Metadata = { title: "Início" };

export default async function PortalDashboardPage() {
  const user = await requireUser();

  let company;
  let data;
  try {
    [company, data] = await Promise.all([
      getPortalCompany(user),
      getPortalDashboard(user),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!company) notFound();

  const firstName = user.name.split(" ")[0] || user.name;

  return (
    <div className="space-y-8">
      {/* ─── Saudação + CTA ─── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Olá, {firstName}</h1>
          <p className="text-sm text-muted-foreground">
            {company.name} — acompanhe seus projetos e demandas por aqui.
          </p>
        </div>
        <Button render={<Link href="/portal/demandas/nova" />}>
          <Plus />
          Nova demanda
        </Button>
      </div>

      {/* ─── Cards-resumo ─── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FolderKanban className="size-4" />
              Projetos ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold text-[#00d164]">
              {data.activeProjects}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              de {data.projects.length}{" "}
              {data.projects.length === 1 ? "projeto no total" : "projetos no total"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Inbox className="size-4" />
              Demandas em aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold text-[#00d164]">
              {data.openDemands}
            </p>
            <Link
              href="/portal/demandas"
              className="mt-1 inline-block text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver todas as demandas →
            </Link>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calendar className="size-4" />
              Próximos prazos
            </CardTitle>
            <CardDescription>Tarefas com entrega prevista</CardDescription>
          </CardHeader>
          <CardContent>
            {data.upcomingTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum prazo futuro no momento.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {data.upcomingTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 text-sm">
                    <Link
                      href={`/portal/projetos/${task.projectId}/tarefas/${task.id}`}
                      className="min-w-0 flex-1 truncate transition-colors hover:text-[#00d164]"
                      title={`${task.projectName} · ${task.title}`}
                    >
                      {task.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatDate(task.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Projetos ─── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Seus projetos</h2>
          <Link
            href="/portal/projetos"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver todos →
          </Link>
        </div>

        {data.projects.length === 0 ? (
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
            {data.projects.map((project) => {
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
      </section>
    </div>
  );
}
