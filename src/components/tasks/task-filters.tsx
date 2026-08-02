"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusInfo } from "@/lib/queries/projects";
import type { TaskDueFilter } from "@/lib/queries/tasks";
import { priorityLabels, priorities } from "@/lib/validations/project";

const ALL = "__all__";

const dueLabels: Record<TaskDueFilter, string> = {
  semana: "Vencem esta semana",
  mes: "Vencem este mês",
  vencidas: "Vencidas",
};

/** Filtros da lista global de tarefas — searchParams (q, status, prioridade, projeto, vencimento, concluidas). */
export function TaskFilters({
  search,
  statusId,
  priority,
  projectId,
  due,
  showDone,
  statuses,
  projects,
}: {
  search: string;
  statusId: string;
  priority: string;
  projectId: string;
  due: string;
  showDone: boolean;
  statuses: StatusInfo[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchValue, setSearchValue] = useState(search);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get("q") ?? "";
    const next = searchValue.trim();
    if (next === current) return;

    const timeout = setTimeout(() => updateParam("q", next), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Buscar por tarefa..."
          className="bg-white/[0.03] pl-9"
          aria-label="Buscar tarefas"
        />
      </div>

      <Select
        value={statusId || ALL}
        onValueChange={(v) => updateParam("status", !v || v === ALL ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar por status">
          <SelectValue placeholder="Status">
            {(value: string | null) =>
              !value || value === ALL
                ? "Todos os status"
                : (statuses.find((s) => s.id === value)?.name ?? "Status")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {statuses.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={priority || ALL}
        onValueChange={(v) => updateParam("prioridade", !v || v === ALL ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar por prioridade">
          <SelectValue placeholder="Prioridade">
            {(value: string | null) => {
              if (!value || value === ALL) return "Todas as prioridades";
              const p = priorities.find((p) => p === value);
              return p ? priorityLabels[p] : "Prioridade";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as prioridades</SelectItem>
          {priorities.map((p) => (
            <SelectItem key={p} value={p}>
              {priorityLabels[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={projectId || ALL}
        onValueChange={(v) => updateParam("projeto", !v || v === ALL ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar por projeto">
          <SelectValue placeholder="Projeto">
            {(value: string | null) =>
              !value || value === ALL
                ? "Todos os projetos"
                : (projects.find((p) => p.id === value)?.name ?? "Projeto")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os projetos</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={due || ALL}
        onValueChange={(v) => updateParam("vencimento", !v || v === ALL ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar por vencimento">
          <SelectValue placeholder="Vencimento">
            {(value: string | null) =>
              !value || value === ALL
                ? "Todos os prazos"
                : (dueLabels[value as TaskDueFilter] ?? "Vencimento")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os prazos</SelectItem>
          <SelectItem value="semana">{dueLabels.semana}</SelectItem>
          <SelectItem value="mes">{dueLabels.mes}</SelectItem>
          <SelectItem value="vencidas">{dueLabels.vencidas}</SelectItem>
        </SelectContent>
      </Select>

      <label className="flex w-full items-center gap-2 text-sm text-muted-foreground sm:ml-auto sm:w-auto">
        <Checkbox
          checked={showDone}
          onCheckedChange={(checked) =>
            updateParam("concluidas", checked ? "sim" : "")
          }
        />
        Mostrar concluídas
      </label>
    </div>
  );
}
