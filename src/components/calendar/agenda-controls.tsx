"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  isSameMonth,
  parseISO,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { capitalize } from "@/components/calendar/event-shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CalendarView = "dia" | "semana" | "mes" | "ano";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
];

const ALL = "__all__";

type SelectOption = { id: string; name: string };
type ProjectOption = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
};

/** Título do período exibido conforme a visão ativa. */
function periodTitle(view: CalendarView, reference: Date): string {
  switch (view) {
    case "dia":
      return format(reference, "dd/MM/yyyy");
    case "semana": {
      const start = startOfWeek(reference, { weekStartsOn: 1 });
      const end = addDays(start, 6);
      if (isSameMonth(start, end)) {
        return `Semana de ${format(start, "d")}–${format(end, "d")} ${format(end, "MMM", { locale: ptBR })}`;
      }
      return `Semana de ${format(start, "d 'de' MMM", { locale: ptBR })}–${format(end, "d 'de' MMM", { locale: ptBR })}`;
    }
    case "mes":
      return capitalize(format(reference, "LLLL 'de' yyyy", { locale: ptBR }));
    case "ano":
      return format(reference, "yyyy");
  }
}

/** Barra de controle da agenda — estado sincronizado com searchParams. */
export function AgendaControls({
  view,
  date,
  companyId,
  projectId,
  companies,
  projects,
}: {
  view: CalendarView;
  /** Data de referência yyyy-MM-dd (já validada pelo servidor). */
  date: string;
  companyId: string;
  projectId: string;
  companies: SelectOption[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const reference = parseISO(date);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function shift(direction: 1 | -1) {
    const move = {
      dia: addDays,
      semana: addWeeks,
      mes: addMonths,
      ano: addYears,
    }[view];
    updateParams({ data: format(move(reference, direction), "yyyy-MM-dd") });
  }

  function onCompanyChange(value: string | null) {
    const nextCompany = !value || value === ALL ? "" : value;
    const updates: Record<string, string> = { empresa: nextCompany };
    // Limpa o filtro de projeto se ele não pertencer à empresa escolhida
    if (projectId && nextCompany) {
      const project = projects.find((p) => p.id === projectId);
      if (project && project.companyId !== nextCompany) updates.projeto = "";
    }
    updateParams(updates);
  }

  const projectOptions = companyId
    ? projects.filter((p) => p.companyId === companyId)
    : projects;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          onClick={() => shift(-1)}
          aria-label="Período anterior"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => shift(1)}
          aria-label="Próximo período"
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            updateParams({ data: format(new Date(), "yyyy-MM-dd") })
          }
        >
          Hoje
        </Button>
      </div>

      <h2 className="text-lg font-bold">{periodTitle(view, reference)}</h2>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-full border border-border bg-white/[0.03] p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => updateParams({ view: v.id })}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                view === v.id
                  ? "bg-[rgba(0,209,100,0.12)] text-[#00d164]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <Select value={companyId || ALL} onValueChange={onCompanyChange}>
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

        <Select
          value={projectId || ALL}
          onValueChange={(v) =>
            updateParams({ projeto: !v || v === ALL ? "" : v })
          }
        >
          <SelectTrigger aria-label="Filtrar por projeto">
            <SelectValue placeholder="Projeto">
              {(value: string | null) => {
                if (!value || value === ALL) return "Todos os projetos";
                const project = projects.find((p) => p.id === value);
                return project
                  ? `${project.name} (${project.companyName})`
                  : "Projeto";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os projetos</SelectItem>
            {projectOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.companyName})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
