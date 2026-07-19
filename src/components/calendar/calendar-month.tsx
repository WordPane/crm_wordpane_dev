import { addDays, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import Link from "next/link";

import {
  WEEKDAY_SHORT,
  dayViewHref,
  eventColor,
  groupEventsByDate,
} from "@/components/calendar/event-shared";
import type { CalendarEvent } from "@/lib/queries/calendar";
import { cn } from "@/lib/utils";

const MAX_CHIPS_PER_DAY = 3;

/** Grade mensal 7×6 (seg–dom) com chips de eventos por dia. */
export function CalendarMonth({
  events,
  reference,
  filtersQuery,
  basePath,
}: {
  events: CalendarEvent[];
  /** Qualquer data dentro do mês exibido. */
  reference: Date;
  /** Filtros ativos (empresa/projeto) já serializados, para preservar nos links. */
  filtersQuery: string;
  /** Caminho da agenda ("/admin/agenda" ou "/portal/agenda"). */
  basePath: string;
}) {
  const gridStart = startOfWeek(startOfMonth(reference), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const eventsByDate = groupEventsByDate(events);
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <div className="grid grid-cols-7 gap-px bg-border">
        {WEEKDAY_SHORT.map((day) => (
          <div
            key={day}
            className="bg-card px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate.get(dateStr) ?? [];
          const visible = dayEvents.slice(0, MAX_CHIPS_PER_DAY);
          const hidden = dayEvents.length - visible.length;
          const isToday = dateStr === today;
          const inMonth = isSameMonth(day, reference);

          return (
            <div
              key={dateStr}
              className={cn(
                "flex min-h-24 flex-col gap-1 bg-card p-1.5 lg:min-h-28",
                !inMonth && "bg-white/[0.01]",
              )}
            >
              <Link
                href={dayViewHref(basePath, dateStr, filtersQuery)}
                title={`Ver ${format(day, "dd/MM/yyyy")}`}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs transition-colors hover:bg-primary/15 hover:text-primary",
                  isToday
                    ? "font-bold text-primary ring-2 ring-primary"
                    : inMonth
                      ? "text-foreground/80"
                      : "text-muted-foreground/40",
                )}
              >
                {format(day, "d")}
              </Link>

              {visible.map((event) => {
                const color = eventColor(event);
                return (
                  <Link
                    key={`${event.type}-${event.id}`}
                    href={event.href}
                    title={`${event.title} · ${event.subtitle}`}
                    className={cn(
                      "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[0.68rem] leading-tight transition-opacity hover:opacity-80",
                      event.done && "opacity-50",
                    )}
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className={cn(
                        "truncate",
                        event.done && "line-through",
                      )}
                    >
                      {event.title}
                    </span>
                  </Link>
                );
              })}

              {hidden > 0 && (
                <Link
                  href={dayViewHref(basePath, dateStr, filtersQuery)}
                  className="px-1 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  +{hidden}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
