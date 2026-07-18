"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StatusInfo } from "@/lib/queries/projects";

type SelectOption = { id: string; name: string };

const ALL = "__all__";

/** Filtros da lista de projetos — sincronizados com searchParams (q, status, empresa). */
export function ProjectFilters({
  search,
  statusId,
  companyId,
  statuses,
  companies,
}: {
  search: string;
  statusId: string;
  companyId: string;
  statuses: StatusInfo[];
  companies: SelectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(search);

  function updateParam(key: string, paramValue: string) {
    const params = new URLSearchParams(window.location.search);
    if (paramValue) params.set(key, paramValue);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const current =
      new URLSearchParams(window.location.search).get("q") ?? "";
    const next = value.trim();
    if (next === current) return;

    const timeout = setTimeout(() => updateParam("q", next), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Buscar por nome do projeto..."
          className="bg-white/[0.03] pl-9"
          aria-label="Buscar projetos"
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
        value={companyId || ALL}
        onValueChange={(v) => updateParam("empresa", !v || v === ALL ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar por empresa">
          <SelectValue placeholder="Empresa">
            {(value: string | null) =>
              !value || value === ALL
                ? "Todas as empresas"
                : (companies.find((c) => c.id === value)?.name ?? "Empresa")
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as empresas</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
