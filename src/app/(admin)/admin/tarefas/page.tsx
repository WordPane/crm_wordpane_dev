import type { Metadata } from "next";
import { CalendarClock, CalendarDays, ListChecks, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { SavedViews } from "@/components/tasks/saved-views";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TasksTable } from "@/components/tasks/tasks-table";
import { ExportCsvButton } from "@/components/reports/export-csv-button";
import { Card, CardContent } from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listProjects } from "@/lib/queries/projects";
import {
  getTaskSummary,
  listActiveTaskStatuses,
  listTasks,
  type TaskDueFilter,
} from "@/lib/queries/tasks";
import { listCurrentUserSavedViews } from "@/lib/queries/saved-views";
import { listTeamSelectOptions } from "@/lib/queries/team";
import { exportTasksCsv } from "@/server/actions/reports";
import { cn } from "@/lib/utils";
import { priorities } from "@/lib/validations/project";
import type { Task } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Tarefas" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    prioridade?: string | string[];
    projeto?: string | string[];
    vencimento?: string | string[];
    concluidas?: string | string[];
  }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const params = await searchParams;
  const search = first(params.q);
  const statusId = first(params.status);
  const priorityParam = first(params.prioridade);
  const projectId = first(params.projeto);
  const dueParam = first(params.vencimento);
  const showDone = first(params.concluidas) === "sim";
  const priority = (priorities as readonly string[]).includes(priorityParam)
    ? (priorityParam as Task["priority"])
    : "";
  const due: TaskDueFilter | "" = (
    ["semana", "mes", "vencidas"] as const
  ).includes(dueParam as TaskDueFilter)
    ? (dueParam as TaskDueFilter)
    : "";

  const [items, statuses, projects, teamUsers, summary, savedViews] =
    await Promise.all([
      listTasks(user, {
        search,
        statusId,
        priority: priority || undefined,
        projectId,
        hideCompleted: !showDone,
        due: due || undefined,
      }),
      listActiveTaskStatuses(user),
      listProjects(user),
      listTeamSelectOptions(user),
      getTaskSummary(user),
      listCurrentUserSavedViews("tarefas"),
    ]);

  /** Monta a URL da listagem preservando os filtros atuais e trocando `overrides`. */
  function tasksHref(overrides: Record<string, string>): string {
    const current: Record<string, string> = {
      status: statusId,
      prioridade: priority,
      projeto: projectId,
      vencimento: due,
      concluidas: showDone ? "" : "nao",
    };
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...current, ...overrides })) {
      if (value) p.set(key, value);
    }
    const qs = p.toString();
    return qs ? `/admin/tarefas?${qs}` : "/admin/tarefas";
  }

  const summaryCards = [
    {
      label: "Em aberto",
      value: summary.open,
      icon: ListChecks,
      alert: false,
      href: tasksHref({ vencimento: "", concluidas: "nao" }),
      active: !due && !showDone,
    },
    {
      label: "Vencem esta semana",
      value: summary.dueThisWeek,
      icon: CalendarClock,
      alert: false,
      href: tasksHref({ vencimento: due === "semana" ? "" : "semana" }),
      active: due === "semana",
    },
    {
      label: "Vencem este mês",
      value: summary.dueThisMonth,
      icon: CalendarDays,
      alert: false,
      href: tasksHref({ vencimento: due === "mes" ? "" : "mes" }),
      active: due === "mes",
    },
    {
      label: "Vencidas",
      value: summary.overdue,
      icon: TriangleAlert,
      alert: summary.overdue > 0,
      href: tasksHref({ vencimento: due === "vencidas" ? "" : "vencidas" }),
      active: due === "vencidas",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Tarefas</h1>
          <p className="text-sm text-muted-foreground">
            {items.length}{" "}
            {items.length === 1 ? "tarefa encontrada" : "tarefas encontradas"}
          </p>
        </div>
        <ExportCsvButton
          filename="tarefas.csv"
          action={exportTasksCsv}
          label="Exportar CSV"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Link key={card.label} href={card.href} scroll={false}>
            <Card
              className={cn(
                "h-full transition-colors hover:border-primary/40",
                card.active && "border-primary/60 bg-primary/5",
              )}
            >
              <CardContent className="flex items-center gap-4 py-5">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                    card.alert
                      ? "bg-[rgba(255,107,107,0.1)] text-[#ff6b6b] ring-[rgba(255,107,107,0.3)]"
                      : "bg-primary/10 text-primary ring-primary/25"
                  }`}
                >
                  <card.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">
                    {card.label}
                  </p>
                  <p
                    className={`truncate text-2xl font-extrabold ${card.alert ? "text-[#ff6b6b]" : ""}`}
                  >
                    {card.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SavedViews entity="tarefas" views={savedViews} />
      </div>

      <TaskFilters
        search={search}
        statusId={statusId}
        priority={priority}
        projectId={projectId}
        due={due}
        showDone={showDone}
        statuses={statuses}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ListChecks className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhuma tarefa encontrada</p>
            <p className="text-sm text-muted-foreground">
              {statusId || priority || projectId || due || !showDone
                ? "Ajuste os filtros para ver mais resultados."
                : "As tarefas criadas nos projetos aparecem aqui."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <TasksTable
          items={items}
          statuses={statuses}
          teamUsers={teamUsers.map((u) => ({ id: u.id, name: u.name }))}
        />
      )}
    </div>
  );
}
