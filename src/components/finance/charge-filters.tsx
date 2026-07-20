"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  chargeStatusLabels,
  chargeStatuses,
} from "@/lib/validations/finance";

const ALL = "__all__";

const periodLabels: Record<string, string> = {
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
};

/** Filtros da lista de cobranças — searchParams (status, empresa, periodo, base). */
export function ChargeFilters({
  status,
  companyId,
  periodo,
  base,
  companies,
}: {
  status: string;
  companyId: string;
  periodo: string;
  base: string;
  companies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  /** Últimos 12 meses como opções de período (valor YYYY-MM). */
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return {
        value: format(date, "yyyy-MM"),
        label: format(date, "MMM/yyyy", { locale: ptBR }),
      };
    });
  }, []);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    // Sem período ativo, a base da data não faz sentido na URL
    if (key === "periodo" && !value) params.delete("base");
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
              const s = chargeStatuses.find((s) => s === value);
              return s ? chargeStatusLabels[s] : "Status";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          {chargeStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {chargeStatusLabels[s]}
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
              return companies.find((c) => c.id === value)?.name ?? "Empresa";
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

      <Select
        value={periodo || ALL}
        onValueChange={(v) => updateParam("periodo", !v || v === ALL ? "" : v)}
      >
        <SelectTrigger aria-label="Filtrar por período">
          <SelectValue placeholder="Período">
            {(value: string | null) => {
              if (!value || value === ALL) return "Todo o período";
              if (periodLabels[value]) return periodLabels[value];
              const month = monthOptions.find((m) => m.value === value);
              return month ? month.label : "Período";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todo o período</SelectItem>
          <SelectItem value="30d">Últimos 30 dias</SelectItem>
          <SelectItem value="90d">Últimos 90 dias</SelectItem>
          {monthOptions.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {periodo && (
        <Select
          value={base || "vencimento"}
          onValueChange={(v) =>
            updateParam("base", !v || v === "vencimento" ? "" : v)
          }
        >
          <SelectTrigger aria-label="Data usada no filtro de período">
            <SelectValue>
              {(value: string | null) =>
                value === "pagamento" ? "Por pagamento" : "Por vencimento"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vencimento">Por vencimento</SelectItem>
            <SelectItem value="pagamento">Por pagamento</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
