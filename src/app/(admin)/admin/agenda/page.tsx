import {
  addDays,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { Metadata } from "next";

import {
  AgendaControls,
  type CalendarView,
} from "@/components/calendar/agenda-controls";
import { CalendarDay } from "@/components/calendar/calendar-day";
import { CalendarMonth } from "@/components/calendar/calendar-month";
import { CalendarWeek } from "@/components/calendar/calendar-week";
import { CalendarYear } from "@/components/calendar/calendar-year";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import {
  getCalendarEvents,
  getCalendarFilterOptions,
  getCalendarSummary,
} from "@/lib/queries/calendar";

export const metadata: Metadata = { title: "Agenda" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function parseView(value: string): CalendarView {
  return value === "dia" || value === "semana" || value === "ano"
    ? value
    : "mes";
}

/** Data de referência dos searchParams (yyyy-MM-dd) — fallback: hoje. */
function parseReferenceDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parseISO(value);
    if (isValid(parsed)) return parsed;
  }
  return new Date();
}

/** Intervalo visível coberto pela busca de eventos. */
function visibleRange(
  view: CalendarView,
  reference: Date,
): { from: Date; to: Date } {
  switch (view) {
    case "dia":
      return { from: reference, to: reference };
    case "semana": {
      const from = startOfWeek(reference, { weekStartsOn: 1 });
      return { from, to: addDays(from, 6) };
    }
    case "mes": {
      // Grade fixa 7×6: da segunda anterior ao dia 1 até 41 dias depois
      const from = startOfWeek(startOfMonth(reference), { weekStartsOn: 1 });
      return { from, to: addDays(from, 41) };
    }
    case "ano":
      return { from: startOfYear(reference), to: endOfYear(reference) };
  }
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[];
    data?: string | string[];
    empresa?: string | string[];
    projeto?: string | string[];
  }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const params = await searchParams;
  const view = parseView(first(params.view));
  const reference = parseReferenceDate(first(params.data));
  const companyId = first(params.empresa);
  const projectId = first(params.projeto);

  const range = visibleRange(view, reference);

  const [events, summary, options] = await Promise.all([
    getCalendarEvents(user, {
      from: format(range.from, "yyyy-MM-dd"),
      to: format(range.to, "yyyy-MM-dd"),
      companyId: companyId || undefined,
      projectId: projectId || undefined,
    }),
    getCalendarSummary(user),
    getCalendarFilterOptions(user),
  ]);

  // Sufixo dos links internos (visão dia/mês) preservando os filtros ativos
  const filtersParams = new URLSearchParams();
  if (companyId) filtersParams.set("empresa", companyId);
  if (projectId) filtersParams.set("projeto", projectId);
  const filtersQuery = filtersParams.toString();

  const cards = [
    {
      label: "Vencidos",
      value: summary.vencidos,
      alert: summary.vencidos > 0,
    },
    { label: "Hoje", value: summary.hoje, alert: false },
    { label: "Próximos 7 dias", value: summary.proximos7, alert: false },
    { label: "Próximos 30 dias", value: summary.proximos30, alert: false },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Agenda</h1>
        <p className="text-sm text-muted-foreground">
          Vencimentos de projetos, etapas e tarefas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-extrabold ${card.alert ? "text-[#ff6b6b]" : "text-[#00d164]"}`}
              >
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <AgendaControls
        view={view}
        date={format(reference, "yyyy-MM-dd")}
        companyId={companyId}
        projectId={projectId}
        companies={options.companies}
        projects={options.projects}
      />

      {view === "mes" && (
        <CalendarMonth
          events={events}
          reference={reference}
          filtersQuery={filtersQuery}
        />
      )}
      {view === "semana" && (
        <CalendarWeek events={events} weekStart={range.from} />
      )}
      {view === "dia" && <CalendarDay events={events} />}
      {view === "ano" && (
        <CalendarYear
          events={events}
          year={reference.getFullYear()}
          filtersQuery={filtersQuery}
        />
      )}
    </div>
  );
}
