"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { StatusColorChip } from "@/components/chips";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StatusInfo } from "@/lib/queries/projects";
import { updateProjectStatus } from "@/server/actions/projects";

/** Chip de status do projeto com dropdown para troca inline. */
export function ProjectStatusMenu({
  projectId,
  current,
  statuses,
}: {
  projectId: string;
  current: StatusInfo | null;
  statuses: StatusInfo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(statusId: string) {
    startTransition(async () => {
      const result = await updateProjectStatus(projectId, statusId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Status atualizado.");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label="Alterar status do projeto"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {current ? (
          <StatusColorChip name={current.name} color={current.color} />
        ) : (
          <span className="chip border-border bg-muted text-muted-foreground">
            Sem status
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {statuses.map((s) => (
          <DropdownMenuItem
            key={s.id}
            disabled={s.id === current?.id}
            onClick={() => change(s.id)}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
