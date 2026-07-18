import { addDays, format } from "date-fns";
import Link from "next/link";

import {
  WEEKDAY_SHORT,
  eventColor,
  eventTypeLabels,
  groupEventsByDate,
} from "@/components/calendar/event-shared";
import type { CalendarEvent } from "@/lib/queries/calendar";
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

  return (
    <div className="overflow-x-auto">
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
                  ? "bg-[rgba(0,209,100,0.04)] ring-[rgba(0,209,100,0.4)]"
                  : "bg-card ring-foreground/10",
              )}
            >
              <p
                className={cn(
                  "px-1 text-xs font-semibold",
                  isToday ? "text-[#00d164]" : "text-muted-foreground",
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
                        "block truncate text-xs font-medium transition-colors hover:text-[#00d164]",
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
  );
}
