import type { CalendarEvent, CalendarEventType } from "@/lib/queries/calendar";
import { cn } from "@/lib/utils";

/** Cabeçalho de colunas começando na segunda-feira (pt-BR). */
export const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export const eventTypeLabels: Record<CalendarEventType, string> = {
  project: "Projeto",
  milestone: "Etapa",
  task: "Tarefa",
};

/** Cor base por tipo de evento. */
export const eventTypeColors: Record<CalendarEventType, string> = {
  project: "#00d164",
  milestone: "#38bdf8",
  task: "#fbbf24",
};

export const OVERDUE_COLOR = "#ff6b6b";

/** Cor efetiva do evento: atrasado (não concluído) prevalece sobre o tipo. */
export function eventColor(event: CalendarEvent): string {
  return event.overdue ? OVERDUE_COLOR : eventTypeColors[event.type];
}

/** Agrupa eventos por data (yyyy-MM-dd). */
export function groupEventsByDate(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = map.get(event.date);
    if (list) list.push(event);
    else map.set(event.date, [event]);
  }
  return map;
}

/** "julho" → "Julho" (meses pt-BR vêm em minúsculo do date-fns). */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Link para a visão de dia preservando os filtros ativos. */
export function dayViewHref(date: string, filtersQuery: string): string {
  const params = new URLSearchParams(filtersQuery);
  params.set("view", "dia");
  params.set("data", date);
  return `/admin/agenda?${params.toString()}`;
}

/** Link para a visão de mês preservando os filtros ativos. */
export function monthViewHref(monthDate: string, filtersQuery: string): string {
  const params = new URLSearchParams(filtersQuery);
  params.set("view", "mes");
  params.set("data", monthDate);
  return `/admin/agenda?${params.toString()}`;
}

/** Chip com o tipo do evento (Projeto/Etapa/Tarefa) na cor correspondente. */
export function EventTypeChip({
  type,
  overdue = false,
  className,
}: {
  type: CalendarEventType;
  overdue?: boolean;
  className?: string;
}) {
  const color = overdue ? OVERDUE_COLOR : eventTypeColors[type];
  return (
    <span
      className={cn("chip", className)}
      style={{
        color,
        borderColor: `${color}4d`,
        backgroundColor: `${color}1a`,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {eventTypeLabels[type]}
    </span>
  );
}
