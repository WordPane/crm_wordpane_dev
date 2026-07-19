"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { quoteStatusLabels, quoteStatuses } from "@/lib/validations/quote";

const ALL = "__all__";

/** Filtros da lista de orçamentos — searchParams (status, empresa). */
export function QuoteFilters({
  status,
  companyId,
  companies,
}: {
  status: string;
  companyId: string;
  companies: { id: string; name: string }[];
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
        value={status || ALL}
        onValueChange={(v) => updateParam("status", !v || v === ALL ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar por status">
          <SelectValue placeholder="Status">
            {(value: string | null) => {
              if (!value || value === ALL) return "Todos os status";
              const s = quoteStatuses.find((s) => s === value);
              return s ? quoteStatusLabels[s] : "Status";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {quoteStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {quoteStatusLabels[s]}
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
            {(value: string | null) => {
              if (!value || value === ALL) return "Todas as empresas";
              return (
                companies.find((c) => c.id === value)?.name ?? "Empresa"
              );
            }}
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
