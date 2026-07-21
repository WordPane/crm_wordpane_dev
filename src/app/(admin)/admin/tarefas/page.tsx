import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import Link from "next/link";

import { PriorityChip, StatusColorChip } from "@/components/chips";
import { TaskFilters } from "@/components/tasks/task-filters";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listProjects } from "@/lib/queries/projects";
import { listActiveTaskStatuses, listTasks } from "@/lib/queries/tasks";
import { formatDate, isOverdue } from "@/lib/utils/format";
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
    status?: string | string[];
    prioridade?: string | string[];
    projeto?: string | string[];
    concluidas?: string | string[];
  }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const params = await searchParams;
  const statusId = first(params.status);
  const priorityParam = first(params.prioridade);
  const projectId = first(params.projeto);
  const showDone = first(params.concluidas) !== "nao";
  const priority = (priorities as readonly string[]).includes(priorityParam)
    ? (priorityParam as Task["priority"])
    : "";

  const [items, statuses, projects] = await Promise.all([
    listTasks(user, {
      statusId,
      priority: priority || undefined,
      projectId,
      hideCompleted: !showDone,
    }),
    listActiveTaskStatuses(user),
    listProjects(user),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Tarefas</h1>
        <p className="text-sm text-muted-foreground">
          {items.length}{" "}
          {items.length === 1 ? "tarefa encontrada" : "tarefas encontradas"}
        </p>
      </div>

      <TaskFilters
        statusId={statusId}
        priority={priority}
        projectId={projectId}
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
              {statusId || priority || projectId || !showDone
                ? "Ajuste os filtros para ver mais resultados."
                : "As tarefas criadas nos projetos aparecem aqui."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tarefa</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => {
                const overdue = !t.completedAt && isOverdue(t.dueDate);
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link
                        href={`/admin/tarefas/${t.id}`}
                        className="font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {t.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/projetos/${t.projectId}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t.projectName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/clientes/${t.companyId}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t.companyName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {t.status ? (
                        <StatusColorChip
                          name={t.status.name}
                          color={t.status.color}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PriorityChip priority={t.priority} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.ownerName ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        overdue
                          ? "font-medium text-red-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatDate(t.dueDate)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
