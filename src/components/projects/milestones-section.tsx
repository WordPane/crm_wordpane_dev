"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  ChevronUp,
  Flag,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { MilestoneStatusChip } from "@/components/chips";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MilestoneItem } from "@/lib/queries/projects";
import { formatDate, isOverdue } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  milestoneFormSchema,
  milestoneStatusLabels,
  milestoneStatuses,
  type MilestoneFormValues,
} from "@/lib/validations/project";
import {
  createMilestone,
  deleteMilestone,
  moveMilestone,
  updateMilestone,
  updateMilestoneStatus,
} from "@/server/actions/projects";

type SelectOption = { id: string; name: string };

const NONE = "__none__";

export function MilestonesSection({
  projectId,
  milestones,
  teamUsers,
}: {
  projectId: string;
  milestones: MilestoneItem[];
  teamUsers: SelectOption[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MilestoneItem | null>(null);
  const [deleting, setDeleting] = useState<MilestoneItem | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: Promise<{ success: true; id?: string } | { error: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await action;
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Etapas do projeto</CardTitle>
        <CardDescription>
          Marcos (milestones) com progresso das tarefas vinculadas.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus />
            Nova etapa
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Flag className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhuma etapa cadastrada</p>
            <p className="text-sm text-muted-foreground">
              Divida o projeto em etapas para acompanhar o progresso.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {milestones.map((m, index) => {
              const overdue = !m.completedAt && isOverdue(m.dueDate);
              const percent =
                m.totalTasks > 0
                  ? Math.round((m.doneTasks / m.totalTasks) * 100)
                  : 0;
              return (
                <li
                  key={m.id}
                  className="flex items-start gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10"
                >
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Mover para cima"
                      disabled={pending || index === 0}
                      onClick={() =>
                        run(moveMilestone(m.id, "up"), "Etapa reordenada.")
                      }
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Mover para baixo"
                      disabled={pending || index === milestones.length - 1}
                      onClick={() =>
                        run(moveMilestone(m.id, "down"), "Etapa reordenada.")
                      }
                    >
                      <ChevronDown />
                    </Button>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      <MilestoneStatusChip status={m.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.ownerName ?? "Sem responsável"}
                      {" · "}
                      <span
                        className={cn(overdue && "font-medium text-red-300")}
                      >
                        Prazo: {formatDate(m.dueDate)}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Progress value={percent} className="max-w-48 flex-1" />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {m.doneTasks}/{m.totalTasks} tarefas
                      </span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Ações da etapa"
                          disabled={pending}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(m);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                      {milestoneStatuses
                        .filter((s) => s !== m.status)
                        .map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onClick={() =>
                              run(
                                updateMilestoneStatus(m.id, s),
                                s === "concluida"
                                  ? "Etapa concluída."
                                  : "Status da etapa atualizado.",
                              )
                            }
                          >
                            <Flag />
                            Marcar como {milestoneStatusLabels[s].toLowerCase()}
                          </DropdownMenuItem>
                        ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleting(m)}
                      >
                        <Trash2 />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {dialogOpen && (
        <MilestoneDialog
          key={editing?.id ?? "new"}
          projectId={projectId}
          milestone={editing}
          teamUsers={teamUsers}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir etapa"
        description={`Tem certeza que deseja excluir "${deleting?.name}"? As tarefas vinculadas ficam sem etapa.`}
        onConfirm={async () => {
          if (!deleting) return null;
          const result = await deleteMilestone(deleting.id);
          if ("error" in result) return result.error;
          toast.success("Etapa excluída.");
          router.refresh();
          return null;
        }}
      />
    </Card>
  );
}

function MilestoneDialog({
  projectId,
  milestone,
  teamUsers,
  open,
  onOpenChange,
}: {
  projectId: string;
  milestone: MilestoneItem | null;
  teamUsers: SelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = milestone !== null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<MilestoneFormValues>({
    resolver: zodResolver(milestoneFormSchema),
    defaultValues: {
      name: milestone?.name ?? "",
      description: milestone?.description ?? "",
      dueDate: milestone?.dueDate ?? "",
      ownerId: milestone?.ownerId ?? "",
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: MilestoneFormValues) {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateMilestone(milestone.id, values)
        : await createMilestone(projectId, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      toast.success(isEdit ? "Etapa atualizada." : "Etapa criada.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize os dados da etapa."
              : "Crie um marco para organizar as tarefas do projeto."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ms-name">Nome *</Label>
            <Input
              id="ms-name"
              placeholder="Ex.: Homologação"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ms-description">Descrição</Label>
            <Textarea
              id="ms-description"
              placeholder="O que precisa estar pronto nesta etapa..."
              rows={3}
              {...form.register("description")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ms-due">Prazo</Label>
              <Input id="ms-due" type="date" {...form.register("dueDate")} />
              {errors.dueDate && (
                <p className="text-xs text-destructive">
                  {errors.dueDate.message}
                </p>
              )}
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
              {isEdit ? "Salvar alterações" : "Criar etapa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
