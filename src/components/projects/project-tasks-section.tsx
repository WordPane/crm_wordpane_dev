"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ViewToggle, type ViewMode } from "@/components/ui/view-toggle";
import type { ProjectTaskItem, StatusInfo } from "@/lib/queries/projects";
import { useViewPreference } from "@/lib/use-view-preference";
import { formatDate, isOverdue } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  priorityLabels,
  priorities,
} from "@/lib/validations/project";
import { taskFormSchema, type TaskFormValues } from "@/lib/validations/task";
import { createTask, updateTaskStatus } from "@/server/actions/tasks";

type SelectOption = { id: string; name: string };

const NONE = "__none__";

type MilestoneOption = { id: string; name: string };

function TaskRow({
  task,
  milestoneName,
}: {
  task: ProjectTaskItem;
  milestoneName?: string | null;
}) {
  const overdue = !task.completedAt && isOverdue(task.dueDate);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <Link
        href={`/admin/tarefas/${task.id}?from=projeto`}
        className="font-medium text-foreground transition-colors hover:text-primary"
      >
        {task.title}
      </Link>
      {milestoneName && (
        <span className="text-xs text-muted-foreground">{milestoneName}</span>
      )}
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

/** Ordena por vencimento (sem prazo vai para o fim). */
function byDueDate(a: ProjectTaskItem, b: ProjectTaskItem): number {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

export function ProjectTasksSection({
  projectId,
  milestones,
  tasks,
  statuses,
  teamUsers,
  currentUserId,
}: {
  projectId: string;
  milestones: MilestoneOption[];
  tasks: ProjectTaskItem[];
  statuses: StatusInfo[];
  teamUsers: SelectOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetMilestone, setPresetMilestone] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [view, setView] = useViewPreference<ViewMode>(
    "view:project-tasks",
    "lista",
  );
  const [order, setOrder] = useViewPreference<"etapas" | "vencimento">(
    "order:project-tasks",
    "etapas",
  );
  const [ownerFilter, setOwnerFilter] = useViewPreference<string>(
    "filter:project-tasks-owner",
    "todos",
  );
  const [showDone, setShowDone] = useViewPreference<"sim" | "nao">(
    "filter:project-tasks-show-done",
    "sim",
  );
  const [collapsedJson, setCollapsedJson] = useViewPreference<string>(
    `collapse:project-tasks:${projectId}`,
    "[]",
  );
  const [activeTask, setActiveTask] = useState<ProjectTaskItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const collapsed = useMemo(() => {
    try {
      return new Set(JSON.parse(collapsedJson) as string[]);
    } catch {
      return new Set<string>();
    }
  }, [collapsedJson]);

  function toggleGroup(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedJson(JSON.stringify([...next]));
  }

  function openDialog(milestoneId: string) {
    setPresetMilestone(milestoneId);
    setDialogOpen(true);
  }

  function moveTask(taskId: string, statusId: string) {
    startTransition(async () => {
      const result = await updateTaskStatus(taskId, statusId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Status da tarefa atualizado.");
      router.refresh();
    });
  }

  // Filtros combinados: responsável + mostrar/ocultar concluídas
  const visibleTasks = tasks.filter((t) => {
    if (showDone === "nao" && t.status?.isFinal) return false;
    if (ownerFilter === "minhas" && t.ownerId !== currentUserId) return false;
    if (
      ownerFilter !== "todos" &&
      ownerFilter !== "minhas" &&
      t.ownerId !== ownerFilter
    ) {
      return false;
    }
    return true;
  });

  const milestoneNames = new Map(milestones.map((m) => [m.id, m.name]));

  const groups: { milestone: MilestoneOption | null; tasks: ProjectTaskItem[] }[] =
    [
      ...milestones.map((m) => ({
        milestone: m as MilestoneOption | null,
        tasks: visibleTasks
          .filter((t) => t.milestoneId === m.id)
          .sort(byDueDate),
      })),
      {
        milestone: null,
        tasks: visibleTasks.filter((t) => !t.milestoneId).sort(byDueDate),
      },
    ].filter((g) => g.milestone !== null || g.tasks.length > 0);

  const kanbanColumns = [
    ...statuses.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color as string | null,
      tasks: visibleTasks.filter((t) => t.status?.id === s.id).sort(byDueDate),
    })),
    {
      id: "__none__",
      name: "Sem status",
      color: null,
      tasks: visibleTasks.filter((t) => !t.status).sort(byDueDate),
    },
  ].filter((c) => c.id !== "__none__" || c.tasks.length > 0);

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const overId = event.over?.id;
    if (typeof overId !== "string" || overId === "__none__") return;
    const task = tasks.find((t) => t.id === event.active.id);
    if (!task || task.status?.id === overId) return;
    moveTask(String(event.active.id), overId);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarefas</CardTitle>
        <CardDescription>
          Lista ou kanban, com filtros por responsável e concluídas — a
          escolha fica salva no seu navegador.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => openDialog("")}>
            <Plus />
            Nova tarefa
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={ownerFilter}
            onValueChange={(value) => setOwnerFilter(value ?? "todos")}
          >
            <SelectTrigger className="w-44" aria-label="Filtrar por responsável">
              <SelectValue>
                {(value: string | null) => {
                  if (!value || value === "todos") return "Todos os responsáveis";
                  if (value === "minhas") return "Só as minhas";
                  return (
                    teamUsers.find((u) => u.id === value)?.name ?? "Responsável"
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              <SelectItem value="minhas">Só as minhas</SelectItem>
              {teamUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={order}
            onValueChange={(value) =>
              setOrder(value === "vencimento" ? "vencimento" : "etapas")
            }
          >
            <SelectTrigger className="w-36" aria-label="Ordenar tarefas">
              <SelectValue>
                {(value: string | null) =>
                  value === "vencimento" ? "Por vencimento" : "Por etapa"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="etapas">Por etapa</SelectItem>
              <SelectItem value="vencimento">Por vencimento</SelectItem>
            </SelectContent>
          </Select>

          <ViewToggle value={view} onChange={setView} />

          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={showDone === "sim"}
              onCheckedChange={(checked) =>
                setShowDone(checked ? "sim" : "nao")
              }
            />
            Mostrar concluídas
          </label>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ListChecks className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {tasks.length === 0
                ? "Nenhuma tarefa criada"
                : "Nenhuma tarefa nos filtros"}
            </p>
            <p className="text-sm text-muted-foreground">
              {tasks.length === 0
                ? "Crie a primeira tarefa para começar a execução."
                : "Ajuste os filtros para ver mais tarefas."}
            </p>
          </div>
        ) : view === "kanban" ? (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveTask(null)}
          >
            <div className="flex gap-3 overflow-x-auto pb-1">
              {kanbanColumns.map((column) => (
                <KanbanColumn key={column.id} column={column}>
                  {column.tasks.length === 0 ? (
                    <p className="px-1 pb-2 text-xs text-muted-foreground">
                      Nenhuma tarefa.
                    </p>
                  ) : (
                    column.tasks.map((t) => (
                      <DraggableTaskCard
                        key={t.id}
                        task={t}
                        milestoneName={
                          t.milestoneId
                            ? (milestoneNames.get(t.milestoneId) ?? null)
                            : null
                        }
                        columns={kanbanColumns}
                        pending={pending}
                        onMove={moveTask}
                      />
                    ))
                  )}
                </KanbanColumn>
              ))}
            </div>
            <DragOverlay>
              {activeTask ? <TaskCardPreview task={activeTask} /> : null}
            </DragOverlay>
          </DndContext>
        ) : order === "vencimento" ? (
          <ul className="divide-y divide-border/60">
            {[...visibleTasks].sort(byDueDate).map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                milestoneName={
                  t.milestoneId ? milestoneNames.get(t.milestoneId) : null
                }
              />
            ))}
          </ul>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => {
              const groupKey = group.milestone?.id ?? "none";
              const isCollapsed = collapsed.has(groupKey);
              return (
                <section key={groupKey}>
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupKey)}
                      aria-expanded={!isCollapsed}
                      className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      {group.milestone?.name ?? "Sem etapa"}
                      <span className="font-normal normal-case">
                        ({group.tasks.length})
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => openDialog(group.milestone?.id ?? "")}
                    >
                      <Plus />
                      Nova tarefa
                    </Button>
                  </div>
                  {!isCollapsed &&
                    (group.tasks.length === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground">
                        Nenhuma tarefa nesta etapa.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {group.tasks.map((t) => (
                          <TaskRow key={t.id} task={t} />
                        ))}
                      </ul>
                    ))}
                </section>
              );
            })}
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

type KanbanColumnData = {
  id: string;
  name: string;
  color: string | null;
  tasks: ProjectTaskItem[];
};

/** Coluna do kanban: alvo de soltura (exceto "Sem status"). */
function KanbanColumn({
  column,
  children,
}: {
  column: KanbanColumnData;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled: column.id === "__none__",
  });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "min-w-56 flex-1 space-y-2 rounded-xl p-2 ring-1 transition-colors",
        isOver
          ? "bg-primary/5 ring-primary/40"
          : "bg-white/[0.02] ring-foreground/5",
      )}
    >
      <header className="flex items-center justify-between gap-2 px-1 pt-1">
        {column.color ? (
          <StatusColorChip name={column.name} color={column.color} />
        ) : (
          <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            {column.name}
          </h3>
        )}
        <span className="text-xs text-muted-foreground">
          {column.tasks.length}
        </span>
      </header>
      {children}
    </section>
  );
}

/** Cartão de tarefa arrastável (menu "Mover para" continua como alternativa). */
function DraggableTaskCard({
  task,
  milestoneName,
  columns,
  pending,
  onMove,
}: {
  task: ProjectTaskItem;
  milestoneName: string | null;
  columns: KanbanColumnData[];
  pending: boolean;
  onMove: (taskId: string, statusId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  const overdue = !task.completedAt && isOverdue(task.dueDate);

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            }
          : undefined
      }
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab space-y-1.5 rounded-lg bg-background p-3 ring-1 ring-foreground/10 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`/admin/tarefas/${task.id}?from=projeto`}
          className="text-sm font-medium hover:text-primary"
        >
          {task.title}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Mover tarefa"
                disabled={pending}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {columns
              .filter((c) => c.id !== "__none__" && c.id !== task.status?.id)
              .map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => onMove(task.id, c.id)}>
                  Mover para {c.name}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {milestoneName && (
        <p className="text-xs text-muted-foreground">{milestoneName}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PriorityChip priority={task.priority} />
        {task.dueDate && (
          <span className={cn(overdue && "font-medium text-red-300")}>
            {formatDate(task.dueDate)}
          </span>
        )}
        <span className="ml-auto">{task.ownerName ?? "—"}</span>
      </div>
    </div>
  );
}

/** Pré-visualização do cartão enquanto arrasta (DragOverlay). */
function TaskCardPreview({ task }: { task: ProjectTaskItem }) {
  return (
    <div className="w-56 space-y-1.5 rounded-lg bg-background p-3 ring-2 ring-primary/40">
      <p className="text-sm font-medium">{task.title}</p>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PriorityChip priority={task.priority} />
        {task.dueDate && <span>{formatDate(task.dueDate)}</span>}
      </div>
    </div>
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
