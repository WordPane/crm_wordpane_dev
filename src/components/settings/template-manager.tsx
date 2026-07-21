"use client";

import {
  ArrowDown,
  ArrowUp,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import type { ProjectTemplateItem } from "@/lib/queries/templates";
import { priorityLabels, priorities } from "@/lib/validations/project";
import {
  deleteProjectTemplate,
  saveProjectTemplate,
} from "@/server/actions/templates";

type TaskDraft = {
  key: string;
  title: string;
  description: string;
  priority: (typeof priorities)[number];
  visibleToClient: boolean;
};

type MilestoneDraft = {
  key: string;
  name: string;
  tasks: TaskDraft[];
};

let draftKey = 0;
function nextKey(): string {
  draftKey += 1;
  return `draft-${draftKey}`;
}

function toDrafts(template: ProjectTemplateItem): MilestoneDraft[] {
  return template.milestones.map((m) => ({
    key: nextKey(),
    name: m.name,
    tasks: m.tasks.map((t) => ({
      key: nextKey(),
      title: t.title,
      description: t.description ?? "",
      priority: t.priority,
      visibleToClient: t.visibleToClient,
    })),
  }));
}

/** Troca dois itens vizinhos de posição (ordem das etapas/tarefas). */
function moveItem<T>(arr: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Gestão dos modelos de projeto (etapas + tarefas) — super admin. */
export function TemplateManager({
  templates,
}: {
  templates: ProjectTemplateItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProjectTemplateItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ProjectTemplateItem | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelos de projeto</CardTitle>
        <CardDescription>
          Conjuntos prontos de etapas e tarefas para aplicar na criação do
          projeto ou depois, na aba Etapas.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            Novo modelo
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {templates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum modelo cadastrado. Crie o primeiro para agilizar novos
            projetos.
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => {
              const taskCount = template.milestones.reduce(
                (sum, m) => sum + m.tasks.length,
                0,
              );
              return (
                <li
                  key={template.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 ring-1 ring-border"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                    <Layers className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {template.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {template.milestones.length}{" "}
                      {template.milestones.length === 1 ? "etapa" : "etapas"} ·{" "}
                      {taskCount} {taskCount === 1 ? "tarefa" : "tarefas"}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${template.name}`}
                    onClick={() => setEditing(template)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir ${template.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleting(template)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {(creating || editing) && (
        <TemplateEditorDialog
          template={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir modelo"
        description={
          deleting
            ? `Tem certeza que deseja excluir o modelo "${deleting.name}"? Projetos já criados com ele não são afetados.`
            : ""
        }
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (!deleting) return null;
          const result = await deleteProjectTemplate(deleting.id);
          if ("error" in result) return result.error;
          toast.success("Modelo excluído.");
          router.refresh();
          return null;
        }}
      />
    </Card>
  );
}

/** Diálogo de edição/criação: árvore de etapas e tarefas salva de uma vez. */
function TemplateEditorDialog({
  template,
  onClose,
  onSaved,
}: {
  template: ProjectTemplateItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(() =>
    template ? toDrafts(template) : [{ key: nextKey(), name: "", tasks: [] }],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateMilestone(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveProjectTemplate(template?.id ?? null, {
        name,
        description,
        milestones: milestones.map((m) => ({
          name: m.name,
          description: "",
          tasks: m.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            priority: t.priority,
            visibleToClient: t.visibleToClient,
          })),
        })),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(template ? "Modelo atualizado." : "Modelo criado.");
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? "Editar modelo" : "Novo modelo"}
          </DialogTitle>
          <DialogDescription>
            Etapas e tarefas criadas automaticamente ao aplicar o modelo em um
            projeto.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nome do modelo *</Label>
              <Input
                id="tpl-name"
                placeholder="Ex.: Site institucional padrão"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">Descrição</Label>
              <Textarea
                id="tpl-desc"
                rows={1}
                placeholder="Quando usar este modelo"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Etapas do modelo *</Label>
            {milestones.map((milestone, mi) => (
              <div
                key={milestone.key}
                className="space-y-3 rounded-xl p-3 ring-1 ring-border"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {mi + 1}.
                  </span>
                  <Input
                    placeholder="Nome da etapa (ex.: Descoberta)"
                    value={milestone.name}
                    onChange={(e) =>
                      updateMilestone(mi, { name: e.target.value })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Mover etapa para cima"
                    disabled={mi === 0}
                    onClick={() =>
                      setMilestones((prev) => moveItem(prev, mi, -1))
                    }
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Mover etapa para baixo"
                    disabled={mi === milestones.length - 1}
                    onClick={() =>
                      setMilestones((prev) => moveItem(prev, mi, 1))
                    }
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover etapa"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={milestones.length === 1}
                    onClick={() =>
                      setMilestones((prev) => prev.filter((_, i) => i !== mi))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="space-y-2 pl-6">
                  {milestone.tasks.map((task, ti) => (
                    <div
                      key={task.key}
                      className="space-y-2 rounded-lg p-2 ring-1 ring-border/60"
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Título da tarefa"
                          value={task.title}
                          onChange={(e) =>
                            updateMilestone(mi, {
                              tasks: milestone.tasks.map((t, i) =>
                                i === ti ? { ...t, title: e.target.value } : t,
                              ),
                            })
                          }
                        />
                        <Select
                          value={task.priority}
                          onValueChange={(value) =>
                            updateMilestone(mi, {
                              tasks: milestone.tasks.map((t, i) =>
                                i === ti
                                  ? {
                                      ...t,
                                      priority:
                                        value as (typeof priorities)[number],
                                    }
                                  : t,
                              ),
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-28"
                            aria-label="Prioridade"
                          >
                            <SelectValue>
                              {(value: string | null) =>
                                priorityLabels[
                                  value as (typeof priorities)[number]
                                ] ?? "Média"
                              }
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
                        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                          <Checkbox
                            checked={task.visibleToClient}
                            onCheckedChange={(checked) =>
                              updateMilestone(mi, {
                                tasks: milestone.tasks.map((t, i) =>
                                  i === ti ? { ...t, visibleToClient: checked } : t,
                                ),
                              })
                            }
                          />
                          Cliente vê
                        </label>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Mover tarefa para cima"
                          disabled={ti === 0}
                          onClick={() =>
                            updateMilestone(mi, {
                              tasks: moveItem(milestone.tasks, ti, -1),
                            })
                          }
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Mover tarefa para baixo"
                          disabled={ti === milestone.tasks.length - 1}
                          onClick={() =>
                            updateMilestone(mi, {
                              tasks: moveItem(milestone.tasks, ti, 1),
                            })
                          }
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remover tarefa"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            updateMilestone(mi, {
                              tasks: milestone.tasks.filter((_, i) => i !== ti),
                            })
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Descrição da tarefa (opcional)"
                        value={task.description}
                        onChange={(e) =>
                          updateMilestone(mi, {
                            tasks: milestone.tasks.map((t, i) =>
                              i === ti
                                ? { ...t, description: e.target.value }
                                : t,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateMilestone(mi, {
                        tasks: [
                          ...milestone.tasks,
                          {
                            key: nextKey(),
                            title: "",
                            description: "",
                            priority: "media",
                            visibleToClient: true,
                          },
                        ],
                      })
                    }
                  >
                    <Plus />
                    Tarefa
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setMilestones((prev) => [
                  ...prev,
                  { key: nextKey(), name: "", tasks: [] },
                ])
              }
            >
              <Plus />
              Adicionar etapa
            </Button>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {template ? "Salvar alterações" : "Criar modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
