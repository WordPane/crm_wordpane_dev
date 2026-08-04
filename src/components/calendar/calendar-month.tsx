import {
  addDays,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarX2 } from "lucide-react";
import Link from "next/link";

import {
  EventTypeChip,
  WEEKDAY_SHORT,
  dayViewHref,
  eventColor,
  groupEventsByDate,
} from "@/components/calendar/event-shared";
import type { CalendarEvent } from "@/lib/queries/calendar.types";
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

  const monthDaysWithEvents = days
    .filter((day) => isSameMonth(day, reference))
    .map((day) => ({
      day,
      dateStr: format(day, "yyyy-MM-dd"),
      events: eventsByDate.get(format(day, "yyyy-MM-dd")) ?? [],
    }))
    .filter((d) => d.events.length > 0);

  return (
    <>
      {/* Mobile: lista vertical de dias com eventos */}
      <div className="space-y-4 lg:hidden">
        {monthDaysWithEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-card py-12 text-center ring-1 ring-foreground/10">
            <CalendarX2 className="size-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhum vencimento neste mês.
            </p>
          </div>
        ) : (
          monthDaysWithEvents.map(({ day, dateStr, events: dayEvents }) => {
            const isToday = dateStr === today;
            return (
              <div
                key={dateStr}
                className={cn(
                  "rounded-xl bg-card p-3 ring-1 ring-foreground/10",
                  isToday && "ring-2 ring-primary",
                )}
              >
                <Link
                  href={dayViewHref(basePath, dateStr, filtersQuery)}
                  className={cn(
                    "mb-2 block text-sm font-semibold",
                    isToday ? "text-primary" : "text-foreground",
                  )}
                >
                  {capitalize(format(day, "EEEE, d 'de' MMMM", { locale: ptBR }))}
                </Link>
                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <MobileEventCard key={`${event.type}-${event.id}`} event={event} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: grade mensal */}
      <div className="hidden overflow-hidden rounded-xl ring-1 ring-foreground/10 lg:block">
        <div className="overflow-x-auto">
          <div className="min-w-[44rem] grid grid-cols-7 gap-px bg-border">
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
                        style={{
                          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
                        }}
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
      </div>
    </>
  );
}

function MobileEventCard({ event }: { event: CalendarEvent }) {
  return (
    <Link
      href={event.href}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border border-l-2 bg-background/40 p-2.5 transition-colors hover:bg-muted",
        event.done && "opacity-50",
      )}
      style={{ borderLeftColor: eventColor(event) }}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
        <EventTypeChip type={event.type} overdue={event.overdue} className="text-[0.6rem]" />
          {event.overdue && (
            <span className="chip border-red-400/30 bg-red-400/10 text-red-300 text-[0.6rem]">
              Atrasado
            </span>
          )}
        </div>
        <p
          className={cn(
            "truncate text-sm font-medium",
            event.done && "line-through",
          )}
        >
          {event.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {event.subtitle}
        </p>
      </div>
    </Link>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
