"use client";

import { ListChecks } from "lucide-react";
import Link from "next/link";

import { PriorityChip, StatusColorChip } from "@/components/chips";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useViewPreference } from "@/lib/use-view-preference";
import type { StatusInfo } from "@/lib/queries/projects";
import type { Task } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/format";

type PortalTask = Task & { status: StatusInfo | null };

function TaskRow({ projectId, task }: { projectId: string; task: PortalTask }) {
  return (
    <li>
      <Link
        href={`/portal/projetos/${projectId}/tarefas/${task.id}`}
        className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10 transition-colors hover:ring-primary/40"
      >
        <ListChecks className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {task.title}
        </span>
        {task.status && (
          <StatusColorChip name={task.status.name} color={task.status.color} />
        )}
        <PriorityChip priority={task.priority} />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          {formatDate(task.dueDate)}
        </span>
      </Link>
    </li>
  );
}

export function PortalProjectTasksSection({
  projectId,
  milestones,
  tasks,
}: {
  projectId: string;
  milestones: { id: string; name: string }[];
  tasks: PortalTask[];
}) {
  const [showDone, setShowDone] = useViewPreference<"sim" | "nao">(
    "filter:portal-show-done",
    "nao",
  );

  const visibleTasks = tasks.filter((t) => {
    if (showDone === "nao" && t.status?.isFinal) return false;
    return true;
  });

  const tasksByMilestone = new Map<string | null, PortalTask[]>();
  for (const task of visibleTasks) {
    const list = tasksByMilestone.get(task.milestoneId) ?? [];
    list.push(task);
    tasksByMilestone.set(task.milestoneId, list);
  }
  const looseTasks = tasksByMilestone.get(null) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4" />
          Tarefas
        </CardTitle>
        <CardDescription>
          Tarefas visíveis para você, agrupadas por etapa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={showDone === "sim"}
            onCheckedChange={(checked) =>
              setShowDone(checked ? "sim" : "nao")
            }
          />
          Mostrar concluídas
        </label>

        {visibleTasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma tarefa visível para você ainda.
          </p>
        ) : (
          <>
            {milestones.map((milestone) => {
              const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
              if (milestoneTasks.length === 0) return null;
              return (
                <section key={milestone.id} className="space-y-2">
                  <h3 className="text-sm font-semibold">{milestone.name}</h3>
                  <ul className="space-y-1.5">
                    {milestoneTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        projectId={projectId}
                        task={task}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}

            {looseTasks.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Sem etapa
                </h3>
                <ul className="space-y-1.5">
                  {looseTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      projectId={projectId}
                      task={task}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
