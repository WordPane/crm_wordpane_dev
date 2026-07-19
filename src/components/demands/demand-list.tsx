"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRightLeft,
  ChevronDown,
  ExternalLink,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  DemandCategoryChip,
  DemandStatusChip,
  PriorityChip,
} from "@/components/chips";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DemandListItem } from "@/lib/queries/demands";
import { formatDate, timeAgo } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  convertDemandSchema,
  demandCategories,
  demandCategoryLabels,
  demandStatusLabels,
  demandStatuses,
  demandUpdateSchema,
  type ConvertDemandValues,
  type DemandUpdateValues,
} from "@/lib/validations/demand";
import { priorities, priorityLabels } from "@/lib/validations/project";
import type { Demand } from "@/lib/db/schema";
import {
  convertDemandToTask,
  deleteDemand,
  updateDemand,
  updateDemandStatus,
} from "@/server/actions/demands";

const NONE = "__none__";

type SelectOption = { id: string; name: string };
type ProjectOption = SelectOption & { companyId: string };
type MilestoneOption = SelectOption & { projectId: string };

type DemandListProps = {
  demands: DemandListItem[];
  projects: ProjectOption[];
  milestones: MilestoneOption[];
  teamUsers: SelectOption[];
  /** false na tab Demandas da empresa (esconde a coluna Empresa). */
  showCompany?: boolean;
  /** super_admin: habilita editar/excluir demandas. */
  canManage?: boolean;
};

/** Lista de demandas com linha expansível: descrição + triagem (status/conversão). */
export function DemandList({
  demands,
  projects,
  milestones,
  teamUsers,
  showCompany = true,
  canManage = false,
}: DemandListProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [converting, setConverting] = useState<DemandListItem | null>(null);
  const [editing, setEditing] = useState<DemandListItem | null>(null);
  const [deleting, setDeleting] = useState<DemandListItem | null>(null);
  const [pending, startTransition] = useTransition();

  function changeStatus(demand: DemandListItem, status: Demand["status"]) {
    if (status === demand.status) return;
    startTransition(async () => {
      const result = await updateDemandStatus(demand.id, status);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Status da demanda atualizado.");
      router.refresh();
    });
  }

  const colSpan = showCompany ? 7 : 6;

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Demanda</TableHead>
              {showCompany && <TableHead>Empresa</TableHead>}
              <TableHead>Categoria</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Autor</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {demands.map((demand) => {
              const expanded = expandedId === demand.id;
              return [
                <TableRow
                  key={demand.id}
                  className="cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : demand.id)}
                >
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <ChevronDown
                        className={cn(
                          "size-3.5 text-muted-foreground transition-transform",
                          !expanded && "-rotate-90",
                        )}
                      />
                      {demand.title}
                    </span>
                  </TableCell>
                  {showCompany && (
                    <TableCell>
                      <Link
                        href={`/admin/clientes/${demand.companyId}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {demand.companyName}
                      </Link>
                    </TableCell>
                  )}
                  <TableCell>
                    <DemandCategoryChip category={demand.category} />
                  </TableCell>
                  <TableCell>
                    <PriorityChip priority={demand.priority} />
                  </TableCell>
                  <TableCell>
                    <DemandStatusChip status={demand.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {demand.authorName ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={formatDate(demand.createdAt)}
                  >
                    {timeAgo(demand.createdAt)}
                  </TableCell>
                </TableRow>,
                expanded ? (
                  <TableRow
                    key={`${demand.id}-detail`}
                    className="hover:bg-transparent"
                  >
                    <TableCell
                      colSpan={colSpan}
                      className="bg-white/[0.02] align-top"
                    >
                      <div className="space-y-4 py-2">
                        {demand.projectId && demand.projectName && (
                          <p className="text-xs text-muted-foreground">
                            Projeto:{" "}
                            <Link
                              href={`/admin/projetos/${demand.projectId}`}
                              className="font-medium text-[#00d164] hover:underline"
                            >
                              {demand.projectName}
                            </Link>
                          </p>
                        )}
                        <p className="max-w-3xl text-sm whitespace-pre-wrap text-muted-foreground">
                          {demand.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          <Select
                            value={demand.status}
                            disabled={pending}
                            onValueChange={(value) =>
                              changeStatus(demand, value as Demand["status"])
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              aria-label="Mudar status da demanda"
                            >
                              <SelectValue>
                                {(value: string | null) => {
                                  const s = demandStatuses.find(
                                    (s) => s === value,
                                  );
                                  return s ? demandStatusLabels[s] : "";
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {demandStatuses.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {demandStatusLabels[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {demand.taskId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              render={
                                <Link href={`/admin/tarefas/${demand.taskId}`} />
                              }
                            >
                              <ExternalLink />
                              Ver tarefa vinculada
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() => setConverting(demand)}
                            >
                              <ArrowRightLeft />
                              Converter em tarefa
                            </Button>
                          )}

                          {canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              onClick={() => setEditing(demand)}
                            >
                              <Pencil />
                              Editar
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending}
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(demand)}
                            >
                              <Trash2 />
                              Excluir
                            </Button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null,
              ];
            })}
          </TableBody>
        </Table>
      </div>

      {converting && (
        <ConvertDemandDialog
          demand={converting}
          projects={projects.filter((p) => p.companyId === converting.companyId)}
          milestones={milestones}
          teamUsers={teamUsers}
          open={converting !== null}
          onOpenChange={(open) => {
            if (!open) setConverting(null);
          }}
        />
      )}

      {editing && (
        <EditDemandDialog
          demand={editing}
          projects={projects.filter((p) => p.companyId === editing.companyId)}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          title="Excluir demanda"
          description={`Tem certeza que deseja excluir "${deleting.title}"? Os anexos também serão removidos.${deleting.taskId ? " A tarefa vinculada criada a partir dela será mantida." : ""} Esta ação não pode ser desfeita.`}
          onConfirm={async () => {
            const result = await deleteDemand(deleting.id);
            if ("error" in result) return result.error;
            toast.success("Demanda excluída.");
            setDeleting(null);
            router.refresh();
            return null;
          }}
        />
      )}
    </>
  );
}

function ConvertDemandDialog({
  demand,
  projects,
  milestones,
  teamUsers,
  open,
  onOpenChange,
}: {
  demand: DemandListItem;
  projects: SelectOption[];
  milestones: MilestoneOption[];
  teamUsers: SelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(
    demand.projectId ?? "",
  );

  const form = useForm<ConvertDemandValues>({
    resolver: zodResolver(convertDemandSchema),
    defaultValues: {
      projectId: demand.projectId ?? "",
      milestoneId: "",
      ownerId: "",
    },
  });
  const { errors, isSubmitting } = form.formState;
  const projectMilestones = milestones.filter(
    (m) => m.projectId === selectedProjectId,
  );

  async function onSubmit(values: ConvertDemandValues) {
    setError(null);
    const result = await convertDemandToTask(demand.id, values);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success("Demanda convertida em tarefa.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Converter em tarefa</DialogTitle>
          <DialogDescription>
            A tarefa será criada com o título e a descrição de &quot;
            {demand.title}&quot;.
          </DialogDescription>
        </DialogHeader>

        {projects.length === 0 ? (
          <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
            Esta empresa ainda não tem projetos. Crie um projeto antes de
            converter a demanda.
          </p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Projeto *</Label>
              <Controller
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(value) => {
                      const next = !value || value === NONE ? "" : value;
                      field.onChange(next);
                      setSelectedProjectId(next);
                      form.setValue("milestoneId", "");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o projeto">
                        {(value: string | null) =>
                          !value || value === NONE
                            ? "Selecione o projeto"
                            : (projects.find((p) => p.id === value)?.name ??
                              "Selecione o projeto")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Selecione o projeto</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.projectId && (
                <p className="text-xs text-destructive">
                  {errors.projectId.message}
                </p>
              )}
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
                      disabled={!selectedProjectId || projectMilestones.length === 0}
                      onValueChange={(value) =>
                        field.onChange(value === NONE ? "" : value)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Opcional">
                          {(value: string | null) =>
                            !value
                              ? "Opcional"
                              : value === NONE
                                ? "Sem etapa"
                                : (projectMilestones.find((m) => m.id === value)
                                    ?.name ?? "Opcional")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sem etapa</SelectItem>
                        {projectMilestones.map((m) => (
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
                        <SelectValue placeholder="Opcional">
                          {(value: string | null) =>
                            !value
                              ? "Opcional"
                              : value === NONE
                                ? "Sem responsável"
                                : (teamUsers.find((u) => u.id === value)?.name ??
                                  "Opcional")
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
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                Criar tarefa
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Edição da demanda pelo super admin (título, descrição, categoria, prioridade, projeto). */
function EditDemandDialog({
  demand,
  projects,
  open,
  onOpenChange,
}: {
  demand: DemandListItem;
  projects: SelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<DemandUpdateValues>({
    resolver: zodResolver(demandUpdateSchema),
    defaultValues: {
      projectId: demand.projectId ?? "",
      title: demand.title,
      category: demand.category,
      priority: demand.priority,
      description: demand.description,
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: DemandUpdateValues) {
    setError(null);
    const result = await updateDemand(demand.id, values);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success("Demanda atualizada.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar demanda</DialogTitle>
          <DialogDescription>
            Corrija os dados enviados pelo cliente. A demanda vinculada a uma
            tarefa continua apontando para a mesma tarefa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ed-title">Título *</Label>
            <Input
              id="ed-title"
              aria-invalid={!!errors.title}
              {...form.register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) => {
                          const c = demandCategories.find((c) => c === value);
                          return c ? demandCategoryLabels[c] : "";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {demandCategories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {demandCategoryLabels[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade *</Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) => {
                          const p = priorities.find((p) => p === value);
                          return p ? priorityLabels[p] : "";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {priorities.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priorityLabels[priority]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Projeto</Label>
            <Controller
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <Select
                  value={field.value || NONE}
                  onValueChange={(value) =>
                    field.onChange(!value || value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sem projeto">
                      {(value: string | null) =>
                        !value || value === NONE
                          ? "Sem projeto"
                          : (projects.find((p) => p.id === value)?.name ??
                            "Sem projeto")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem projeto</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ed-description">Descrição *</Label>
            <Textarea
              id="ed-description"
              rows={6}
              aria-invalid={!!errors.description}
              {...form.register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
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
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
