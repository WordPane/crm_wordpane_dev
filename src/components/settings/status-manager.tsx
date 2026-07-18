"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
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
import type { StatusWithUsage } from "@/lib/queries/settings";
import { statusFormSchema, type StatusFormValues } from "@/lib/validations/settings";
import {
  createStatus,
  deleteStatus,
  moveStatus,
  updateStatus,
  type StatusKind,
} from "@/server/actions/settings";

type ListConfig = {
  kind: StatusKind;
  title: string;
  description: string;
  usageLabel: string;
};

const LISTS: ListConfig[] = [
  {
    kind: "project",
    title: "Status de projeto",
    description: "Etapa do funil em que o projeto se encontra.",
    usageLabel: "projeto(s) usando",
  },
  {
    kind: "task",
    title: "Status de tarefa",
    description: "Situação de execução das tarefas.",
    usageLabel: "tarefa(s) usando",
  },
];

export function StatusManager({
  projectStatuses,
  taskStatuses,
}: {
  projectStatuses: StatusWithUsage[];
  taskStatuses: StatusWithUsage[];
}) {
  const items: Record<StatusKind, StatusWithUsage[]> = {
    project: projectStatuses,
    task: taskStatuses,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {LISTS.map((config) => (
        <StatusList
          key={config.kind}
          config={config}
          statuses={items[config.kind]}
        />
      ))}
    </div>
  );
}

function StatusList({
  config,
  statuses,
}: {
  config: ListConfig;
  statuses: StatusWithUsage[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StatusWithUsage | null>(null);
  const [deleting, setDeleting] = useState<StatusWithUsage | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(s: StatusWithUsage, field: "isFinal" | "active") {
    startTransition(async () => {
      const result = await updateStatus(config.kind, s.id, {
        name: s.name,
        color: s.color,
        isFinal: field === "isFinal" ? !s.isFinal : s.isFinal,
        active: field === "active" ? !s.active : s.active,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveStatus(config.kind, id, direction);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus />
            Novo status
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {statuses.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum status cadastrado.
          </p>
        ) : (
          <ul className="space-y-2">
            {statuses.map((s, index) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10"
              >
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Mover para cima"
                    disabled={pending || index === 0}
                    onClick={() => move(s.id, "up")}
                  >
                    <ChevronUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Mover para baixo"
                    disabled={pending || index === statuses.length - 1}
                    onClick={() => move(s.id, "down")}
                  >
                    <ChevronDown />
                  </Button>
                </div>

                <span
                  className="size-3.5 shrink-0 rounded-full ring-1 ring-white/20"
                  style={{ backgroundColor: s.color }}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {s.name}
                    {!s.active && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (inativo)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.usageCount} {config.usageLabel}
                  </p>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={s.isFinal}
                    disabled={pending}
                    onCheckedChange={() => toggle(s, "isFinal")}
                    aria-label={`${s.name} encerra o item`}
                  />
                  Encerra o item
                </label>

                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={s.active}
                    disabled={pending}
                    onCheckedChange={() => toggle(s, "active")}
                    aria-label={`${s.name} ativo`}
                  />
                  Ativo
                </label>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Editar ${s.name}`}
                  onClick={() => {
                    setEditing(s);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Excluir ${s.name}`}
                  disabled={s.usageCount > 0}
                  onClick={() => setDeleting(s)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {dialogOpen && (
        <StatusDialog
          key={editing?.id ?? "new"}
          kind={config.kind}
          status={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir status"
        description={`Tem certeza que deseja excluir o status "${deleting?.name}"?`}
        onConfirm={async () => {
          if (!deleting) return null;
          const result = await deleteStatus(config.kind, deleting.id);
          if ("error" in result) return result.error;
          toast.success("Status excluído.");
          router.refresh();
          return null;
        }}
      />
    </Card>
  );
}

function StatusDialog({
  kind,
  status,
  open,
  onOpenChange,
}: {
  kind: StatusKind;
  status: StatusWithUsage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = status !== null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<StatusFormValues>({
    resolver: zodResolver(statusFormSchema),
    defaultValues: {
      name: status?.name ?? "",
      color: status?.color ?? "#00d164",
      isFinal: status?.isFinal ?? false,
      active: status?.active ?? true,
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: StatusFormValues) {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateStatus(kind, status.id, values)
        : await createStatus(kind, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      toast.success(isEdit ? "Status atualizado." : "Status criado.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar status" : "Novo status"}</DialogTitle>
          <DialogDescription>
            {kind === "project"
              ? "Status aplicável aos projetos."
              : "Status aplicável às tarefas."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="st-name">Nome *</Label>
            <Input
              id="st-name"
              placeholder="Ex.: Em andamento"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="st-color">Cor</Label>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <input
                    id="st-color"
                    type="color"
                    value={field.value}
                    onChange={field.onChange}
                    className="h-8 w-12 cursor-pointer rounded-lg border border-input bg-transparent"
                  />
                  <Input
                    value={field.value}
                    onChange={field.onChange}
                    className="w-28 font-mono"
                    maxLength={7}
                  />
                </div>
              )}
            />
            {errors.color && (
              <p className="text-xs text-destructive">{errors.color.message}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-6">
            <Controller
              control={form.control}
              name="isFinal"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="st-final"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                  />
                  <Label htmlFor="st-final" className="font-normal">
                    Encerra o item (marca como concluído)
                  </Label>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="st-active"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                  />
                  <Label htmlFor="st-active" className="font-normal">
                    Ativo
                  </Label>
                </div>
              )}
            />
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
              {isEdit ? "Salvar alterações" : "Criar status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
