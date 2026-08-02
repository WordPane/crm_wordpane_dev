"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusInfo } from "@/lib/queries/projects";
import { bulkDeleteTasks, bulkUpdateTasks } from "@/server/actions/tasks";

const NONE = "__none__";
const KEEP = "__keep__";

type BulkAction =
  | { field: "statusId"; value: string }
  | { field: "ownerId"; value: string }
  | { field: "visibleToClient"; value: boolean };

export function TaskBulkActions({
  selectedIds,
  statuses,
  teamUsers,
  onClear,
}: {
  selectedIds: string[];
  statuses: StatusInfo[];
  teamUsers: { id: string; name: string }[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<BulkAction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const count = selectedIds.length;
  if (count === 0) return null;

  function apply() {
    if (!action) return;
    startTransition(async () => {
      const result = await bulkUpdateTasks({
        taskIds: selectedIds,
        ...(action.field === "statusId" && { statusId: action.value }),
        ...(action.field === "ownerId" && {
          ownerId: action.value === NONE ? null : action.value,
        }),
        ...(action.field === "visibleToClient" && {
          visibleToClient: action.value,
        }),
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${count} ${count === 1 ? "tarefa atualizada" : "tarefas atualizadas"}.`);
      setAction(null);
      onClear();
      router.refresh();
    });
  }

  function deleteSelected() {
    setDeleting(true);
    startTransition(async () => {
      const result = await bulkDeleteTasks({ taskIds: selectedIds });
      if ("error" in result) {
        toast.error(result.error);
        setDeleting(false);
        return;
      }
      toast.success(`${count} ${count === 1 ? "tarefa excluída" : "tarefas excluídas"}.`);
      setDeleting(false);
      onClear();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] p-2 ring-1 ring-foreground/10">
      <span className="px-2 text-sm text-muted-foreground">
        {count} {count === 1 ? "selecionada" : "selecionadas"}
      </span>

      <Select
        value={action?.field === "statusId" ? action.value : KEEP}
        onValueChange={(value) =>
          setAction(value && value !== KEEP ? { field: "statusId", value } : null)
        }
      >
        <SelectTrigger className="w-44" aria-label="Alterar status">
          <SelectValue placeholder="Alterar status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={KEEP}>Alterar status</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={action?.field === "ownerId" ? action.value ?? NONE : KEEP}
        onValueChange={(value) =>
          setAction(value && value !== KEEP ? { field: "ownerId", value } : null)
        }
      >
        <SelectTrigger className="w-44" aria-label="Alterar responsável">
          <SelectValue placeholder="Alterar responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={KEEP}>Alterar responsável</SelectItem>
          <SelectItem value={NONE}>Sem responsável</SelectItem>
          {teamUsers.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={
          action?.field === "visibleToClient"
            ? String(action.value)
            : KEEP
        }
        onValueChange={(value) =>
          setAction(
            value && value !== KEEP
              ? { field: "visibleToClient", value: value === "true" }
              : null,
          )
        }
      >
        <SelectTrigger className="w-48" aria-label="Alterar visibilidade">
          <SelectValue placeholder="Alterar visibilidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={KEEP}>Alterar visibilidade</SelectItem>
          <SelectItem value="true">Visível ao cliente</SelectItem>
          <SelectItem value="false">Oculta do cliente</SelectItem>
        </SelectContent>
      </Select>

      <Button
        size="sm"
        disabled={!action || pending}
        onClick={apply}
      >
        {pending && <Loader2 className="animate-spin" />}
        Aplicar
      </Button>

      <Button
        variant="destructive"
        size="sm"
        disabled={pending || deleting}
        onClick={deleteSelected}
      >
        {deleting && <Loader2 className="animate-spin" />}
        <Trash2 className="size-4" />
        Excluir
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={pending || deleting}
        onClick={onClear}
      >
        Limpar
      </Button>
    </div>
  );
}
