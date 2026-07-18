"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusInfo } from "@/lib/queries/projects";
import { priorityLabels, priorities } from "@/lib/validations/project";

const ALL = "__all__";

/** Filtros da lista global de tarefas — searchParams (status, prioridade, projeto). */
export function TaskFilters({
  statusId,
  priority,
  projectId,
  statuses,
  projects,
}: {
  statusId: string;
  priority: string;
  projectId: string;
  statuses: StatusInfo[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
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
    </div>
  );
}
