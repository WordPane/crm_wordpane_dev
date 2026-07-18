"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusInfo } from "@/lib/queries/projects";
import { updateTask, updateTaskStatus } from "@/server/actions/tasks";

const NONE = "__none__";

type SelectOption = { id: string; name: string };

/** Controles da coluna lateral: responsável, status e visibilidade ao cliente. */
export function TaskSidebarControls({
  taskId,
  ownerId,
  statusId,
  visibleToClient,
  statuses,
  teamUsers,
}: {
  taskId: string;
  ownerId: string | null;
  statusId: string | null;
  visibleToClient: boolean;
  statuses: StatusInfo[];
  teamUsers: SelectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    action: Promise<{ success: true; id?: string } | { error: string }>,
    successMessage: string,
  ) {
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
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Responsável</Label>
        <Select
          value={ownerId ?? NONE}
          disabled={pending}
          onValueChange={(value) =>
            run(
              updateTask(taskId, { ownerId: value === NONE ? "" : value }),
              "Responsável atualizado.",
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione">
              {(value: string | null) =>
                !value || value === NONE
                  ? "Sem responsável"
                  : (teamUsers.find((u) => u.id === value)?.name ?? "Selecione")
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
      </div>

      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select
          value={statusId ?? NONE}
          disabled={pending}
          onValueChange={(value) => {
            if (!value || value === NONE) return;
            run(updateTaskStatus(taskId, value), "Status atualizado.");
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione">
              {(value: string | null) =>
                !value || value === NONE
                  ? "Selecione"
                  : (statuses.find((s) => s.id === value)?.name ?? "Selecione")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="ts-visible"
          checked={visibleToClient}
          disabled={pending}
          onCheckedChange={(checked) =>
            run(
              updateTask(taskId, { visibleToClient: checked === true }),
              "Visibilidade atualizada.",
            )
          }
        />
        <Label htmlFor="ts-visible" className="font-normal">
          Visível ao cliente
        </Label>
      </div>
    </div>
  );
}
