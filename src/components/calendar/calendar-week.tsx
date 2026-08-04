import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarX2 } from "lucide-react";
import Link from "next/link";

import {
  EventTypeChip,
  WEEKDAY_SHORT,
  eventColor,
  eventTypeLabels,
  groupEventsByDate,
} from "@/components/calendar/event-shared";
import type { CalendarEvent } from "@/lib/queries/calendar.types";
import { cn } from "@/lib/utils";

/** Semana em 7 colunas (seg–dom) com mini-cards de eventos empilhados. */
export function CalendarWeek({
  events,
  weekStart,
}: {
  events: CalendarEvent[];
  /** Segunda-feira da semana exibida. */
  weekStart: Date;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const eventsByDate = groupEventsByDate(events);
  const today = format(new Date(), "yyyy-MM-dd");

  const daysWithEvents = days
    .map((day) => ({
      day,
      dateStr: format(day, "yyyy-MM-dd"),
      events: eventsByDate.get(format(day, "yyyy-MM-dd")) ?? [],
    }))
    .filter((d) => d.events.length > 0);

  return (
    <>
      {/* Mobile: lista vertical */}
      <div className="space-y-4 lg:hidden">
        {daysWithEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-card py-12 text-center ring-1 ring-foreground/10">
            <CalendarX2 className="size-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhum vencimento nesta semana.
            </p>
          </div>
        ) : (
          daysWithEvents.map(({ day, dateStr, events: dayEvents }) => {
            const isToday = dateStr === today;
            return (
              <div
                key={dateStr}
                className={cn(
                  "rounded-xl bg-card p-3 ring-1 ring-foreground/10",
                  isToday && "ring-2 ring-primary",
                )}
              >
                <p
                  className={cn(
                    "mb-2 text-sm font-semibold",
                    isToday ? "text-primary" : "text-foreground",
                  )}
                >
                  {capitalize(format(day, "EEEE, d 'de' MMMM", { locale: ptBR }))}
                </p>
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

      {/* Desktop: grade semanal */}
      <div className="hidden overflow-x-auto lg:block">
        <div className="grid min-w-[840px] grid-cols-7 gap-2">
          {days.map((day, i) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(dateStr) ?? [];
            const isToday = dateStr === today;

            return (
              <div
                key={dateStr}
                className={cn(
                  "flex min-h-40 flex-col gap-2 rounded-xl p-2 ring-1",
                  isToday
                    ? "bg-primary/5 ring-primary/40"
                    : "bg-card ring-foreground/10",
                )}
              >
                <p
                  className={cn(
                    "px-1 text-xs font-semibold",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {WEEKDAY_SHORT[i]} {format(day, "dd/MM")}
                </p>

                {dayEvents.map((event) => {
                  const color = eventColor(event);
                  return (
                    <div
                      key={`${event.type}-${event.id}`}
                      className={cn(
                        "space-y-1 rounded-lg border border-border border-l-2 bg-background/40 p-2",
                        event.done && "opacity-50",
                      )}
                      style={{ borderLeftColor: color }}
                    >
                      <span
                        className="flex items-center gap-1 text-[0.65rem] font-medium"
                        style={{ color }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {eventTypeLabels[event.type]}
                      </span>
                      <Link
                        href={event.href}
                        title={`${event.title} · ${event.subtitle}`}
                        className={cn(
                          "block truncate text-xs font-medium transition-colors hover:text-primary",
                          event.done && "line-through",
                        )}
                      >
                        {event.title}
                      </Link>
                      <p className="truncate text-[0.65rem] text-muted-foreground">
                        {event.subtitle}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
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
