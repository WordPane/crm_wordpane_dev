"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, ListChecks, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { PriorityChip, StatusColorChip } from "@/components/chips";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProjectTaskItem, StatusInfo } from "@/lib/queries/projects";
import { formatDate, isOverdue } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  priorityLabels,
  priorities,
} from "@/lib/validations/project";
import { taskFormSchema, type TaskFormValues } from "@/lib/validations/task";
import { createTask } from "@/server/actions/tasks";

type SelectOption = { id: string; name: string };

const NONE = "__none__";

type MilestoneOption = { id: string; name: string };

function TaskRow({ task }: { task: ProjectTaskItem }) {
  const overdue = !task.completedAt && isOverdue(task.dueDate);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <Link
        href={`/admin/tarefas/${task.id}`}
        className="font-medium text-foreground transition-colors hover:text-primary"
      >
        {task.title}
      </Link>
      {task.visibleToClient && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className="inline-flex text-muted-foreground" />}
            >
              <Eye className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Visível ao cliente</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{task.ownerName ?? "—"}</span>
        {task.status ? (
          <StatusColorChip name={task.status.name} color={task.status.color} />
        ) : (
          <span>—</span>
        )}
        <PriorityChip priority={task.priority} />
        <span className={cn(overdue && "font-medium text-red-300")}>
          {formatDate(task.dueDate)}
        </span>
      </span>
    </li>
  );
}

export function ProjectTasksSection({
  projectId,
  milestones,
  tasks,
  statuses,
  teamUsers,
}: {
  projectId: string;
  milestones: MilestoneOption[];
  tasks: ProjectTaskItem[];
  statuses: StatusInfo[];
  teamUsers: SelectOption[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetMilestone, setPresetMilestone] = useState<string>("");

  function openDialog(milestoneId: string) {
    setPresetMilestone(milestoneId);
    setDialogOpen(true);
  }

  const groups: { milestone: MilestoneOption | null; tasks: ProjectTaskItem[] }[] =
    [
      ...milestones.map((m) => ({
        milestone: m as MilestoneOption | null,
        tasks: tasks.filter((t) => t.milestoneId === m.id),
      })),
      {
        milestone: null,
        tasks: tasks.filter((t) => !t.milestoneId),
      },
    ].filter((g) => g.milestone !== null || g.tasks.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarefas</CardTitle>
        <CardDescription>
          Tarefas do projeto agrupadas por etapa.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => openDialog("")}>
            <Plus />
            Nova tarefa
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ListChecks className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhuma tarefa criada</p>
            <p className="text-sm text-muted-foreground">
              Crie a primeira tarefa para começar a execução.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.milestone?.id ?? "none"}>
                <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                  <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    {group.milestone?.name ?? "Sem etapa"}
                    <span className="ml-2 font-normal normal-case">
                      ({group.tasks.length})
                    </span>
                  </h3>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => openDialog(group.milestone?.id ?? "")}
                  >
                    <Plus />
                    Nova tarefa
                  </Button>
                </div>
                {group.tasks.length === 0 ? (
                  <p className="py-3 text-xs text-muted-foreground">
                    Nenhuma tarefa nesta etapa.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {group.tasks.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </CardContent>

      {dialogOpen && (
        <TaskDialog
          key={presetMilestone || "none"}
          projectId={projectId}
          milestones={milestones}
          statuses={statuses}
          teamUsers={teamUsers}
          defaultMilestoneId={presetMilestone}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </Card>
  );
}

function TaskDialog({
  projectId,
  milestones,
  statuses,
  teamUsers,
  defaultMilestoneId,
  open,
  onOpenChange,
}: {
  projectId: string;
  milestones: MilestoneOption[];
  statuses: StatusInfo[];
  teamUsers: SelectOption[];
  defaultMilestoneId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      milestoneId: defaultMilestoneId,
      ownerId: "",
      priority: "media",
      dueDate: "",
      statusId: statuses[0]?.id ?? "",
      visibleToClient: true,
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: TaskFormValues) {
    setError(null);
    startTransition(async () => {
      const result = await createTask(projectId, values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Tarefa criada.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>
            Crie uma tarefa vinculada a este projeto.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="td-title">Título *</Label>
            <Input
              id="td-title"
              placeholder="Ex.: Criar layout da home"
              aria-invalid={!!errors.title}
              {...form.register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="td-description">Descrição</Label>
            <Textarea
              id="td-description"
              placeholder="Detalhes da tarefa..."
              rows={3}
              {...form.register("description")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Controller
                control={form.control}
                name="milestoneId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(value) =>
                      field.onChange(value === NONE ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione">
                        {(value: string | null) =>
                          !value || value === NONE
                            ? "Sem etapa"
                            : (milestones.find((m) => m.id === value)?.name ??
                              "Selecione")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem etapa</SelectItem>
                      {milestones.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Controller
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(value) =>
                      field.onChange(value === NONE ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione">
                        {(value: string | null) =>
                          !value || value === NONE
                            ? "Sem responsável"
                            : (teamUsers.find((u) => u.id === value)?.name ??
                              "Selecione")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem responsável</SelectItem>
                      {teamUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione">
                        {(value: string | null) => {
                          if (!value) return "Selecione";
                          const p = priorities.find((p) => p === value);
                          return p ? priorityLabels[p] : "Selecione";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {priorities.map((p) => (
                        <SelectItem key={p} value={p}>
                          {priorityLabels[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-due">Prazo</Label>
              <Input id="td-due" type="date" {...form.register("dueDate")} />
              {errors.dueDate && (
                <p className="text-xs text-destructive">
                  {errors.dueDate.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                control={form.control}
                name="statusId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(value) =>
                      field.onChange(value === NONE ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione">
                        {(value: string | null) =>
                          !value || value === NONE
                            ? "Sem status"
                            : (statuses.find((s) => s.id === value)?.name ??
                              "Selecione")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem status</SelectItem>
                      {statuses.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Controller
                control={form.control}
                name="visibleToClient"
                render={({ field }) => (
                  <>
                    <Checkbox
                      id="td-visible"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked)}
                    />
                    <Label htmlFor="td-visible" className="font-normal">
                      Visível ao cliente
                    </Label>
                  </>
                )}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Criar tarefa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
