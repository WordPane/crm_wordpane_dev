"use client";

import { Bookmark, Loader2, Plus, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteView, saveView } from "@/server/actions/saved-views";

type SavedView = {
  id: string;
  name: string;
  entity: string;
  filters: Record<string, string | boolean | undefined>;
};

/** Converte filtros em query string para aplicar a visualização. */
function viewToQueryString(filters: SavedView["filters"]): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false) continue;
    if (value === true) {
      params.set(key, "sim");
    } else {
      params.set(key, value);
    }
  }
  return params.toString();
}

/** Componente para salvar, listar e aplicar visualizações de filtros. */
export function SavedViews({
  entity,
  views,
}: {
  entity: string;
  views: SavedView[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

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

  function saveCurrentFilters() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const filters: Record<string, string | boolean> = {};
    searchParams.forEach((value, key) => {
      if (key === "view") return;
      filters[key] = value === "sim" ? true : value === "nao" ? false : value;
    });

    run(saveView({ name: trimmed, entity, filters }), () => {
      setName("");
      toast.success("Visualização salva.");
    });
  }

  function removeView(id: string) {
    run(deleteView({ id, entity }), () => toast.success("Visualização removida."));
  }

  const hasFilters = searchParams.toString().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Bookmark className="size-4 text-muted-foreground" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveCurrentFilters();
            }
          }}
          placeholder="Nome da visualização"
          className="h-8 w-44"
          aria-label="Nome da visualização"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!hasFilters || !name.trim() || pending}
          onClick={saveCurrentFilters}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />}
          Salvar
        </Button>
      </div>

      {views.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm">
                <Bookmark className="mr-1.5 size-4" />
                Aplicar ({views.length})
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="w-56">
            {views.map((view) => {
              const qs = viewToQueryString(view.filters);
              return (
                <DropdownMenuItem
                  key={view.id}
                  className="flex items-center justify-between gap-2"
                  onClick={() => router.push(qs ? `${pathname}?${qs}` : pathname)}
                >
                  <span className="truncate">{view.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeView(view.id);
                    }}
                    className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${view.name}`}
                    disabled={pending}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
