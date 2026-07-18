"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { TaskChecklistItem } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  addChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from "@/server/actions/tasks";

/** Checklist da tarefa: adicionar, marcar e remover itens. */
export function TaskChecklist({
  taskId,
  items,
}: {
  taskId: string;
  items: TaskChecklistItem[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  const done = items.filter((i) => i.done).length;
  const percent = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

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
    if (!label.trim()) return;
    run(addChecklistItem(taskId, { label }), () => setLabel(""));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Progress value={percent} className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {done}/{items.length}
        </span>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-white/[0.03]"
            >
              <Checkbox
                checked={item.done}
                disabled={pending}
                onCheckedChange={() => run(toggleChecklistItem(item.id))}
                aria-label={item.label}
              />
              <span
                className={cn(
                  "flex-1 text-sm",
                  item.done && "text-muted-foreground line-through",
                )}
              >
                {item.label}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                aria-label={`Remover ${item.label}`}
                disabled={pending}
                onClick={() => run(deleteChecklistItem(item.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Adicionar item ao checklist..."
          aria-label="Novo item do checklist"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!label.trim() || pending}
          onClick={add}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar
        </Button>
      </div>
    </div>
  );
}
