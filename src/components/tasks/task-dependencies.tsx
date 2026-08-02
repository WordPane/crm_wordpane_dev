"use client";

import { Loader2, Plus, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addTaskDependency,
  removeTaskDependency,
} from "@/server/actions/tasks";

type DependencyTask = {
  id: string;
  title: string;
  completedAt: Date | null;
};

/** Gerenciamento de dependências entre tarefas do mesmo projeto. */
export function TaskDependencies({
  taskId,
  dependencies,
  availableTasks,
}: {
  taskId: string;
  dependencies: DependencyTask[];
  availableTasks: DependencyTask[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const blockingCount = dependencies.filter((d) => !d.completedAt).length;

  function run(
    action: Promise<{ success: true; id?: string } | { error: string }>,
    onSuccess?: () => void,
  ) {
    startTransition(async () => {
      const result = await action;
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function add() {
    if (!selectedId) return;
    run(addTaskDependency(taskId, selectedId), () => setSelectedId(""));
  }

  return (
    <div className="space-y-3">
      {blockingCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Tarefa bloqueada</p>
            <p className="text-amber-200/80">
              {blockingCount} dependência(s) ainda não foi/foram concluída(s).
              Conclua-as antes de finalizar esta tarefa.
            </p>
          </div>
        </div>
      )}

      {dependencies.length > 0 && (
        <ul className="space-y-1">
          {dependencies.map((dep) => (
            <li
              key={dep.id}
              className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-white/[0.03]"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  dep.completedAt ? "bg-emerald-400" : "bg-amber-400",
                )}
                aria-hidden="true"
              />
              <Link
                href={`/admin/tarefas/${dep.id}`}
                className={cn(
                  "flex-1 text-sm hover:text-primary",
                  dep.completedAt && "text-muted-foreground line-through",
                )}
              >
                {dep.title}
              </Link>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                aria-label={`Remover dependência ${dep.title}`}
                disabled={pending}
                onClick={() => run(removeTaskDependency(taskId, dep.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {availableTasks.length > 0 && (
        <div className="space-y-1.5">
          <Label>Adicionar dependência</Label>
          <div className="flex items-center gap-2">
            <Select
              value={selectedId}
              disabled={pending}
              onValueChange={(value) => setSelectedId(value ?? "")}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione uma tarefa" />
              </SelectTrigger>
              <SelectContent>
                {availableTasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedId || pending}
              onClick={add}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Plus />}
              Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
