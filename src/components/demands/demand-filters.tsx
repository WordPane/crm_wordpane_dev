"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  demandStatusLabels,
  demandStatuses,
} from "@/lib/validations/demand";

const ALL = "__all__";

/** Filtro da lista de demandas — searchParams (status). */
export function DemandFilters({ status }: { status: string }) {
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
              const s = demandStatuses.find((s) => s === value);
              return s ? demandStatusLabels[s] : "Status";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {demandStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {demandStatusLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
