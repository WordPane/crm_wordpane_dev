import { CalendarX2 } from "lucide-react";
import Link from "next/link";

import { EventTypeChip } from "@/components/calendar/event-shared";
import { PriorityChip, StatusColorChip } from "@/components/chips";
import type { CalendarEvent } from "@/lib/queries/calendar";
import { cn } from "@/lib/utils";

/** Agenda de um único dia — lista de cards completos dos vencimentos. */
export function CalendarDay({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-card py-16 text-center ring-1 ring-foreground/10">
        <CalendarX2 className="size-12 text-muted-foreground/40" />
        <p className="font-medium">Nenhum vencimento neste dia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div
          key={`${event.type}-${event.id}`}
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
            event.done && "opacity-50",
          )}
        >
          <EventTypeChip type={event.type} overdue={event.overdue} />
          <div className="min-w-0 flex-1">
            <Link
              href={event.href}
              className={cn(
                "block truncate text-sm font-medium transition-colors hover:text-[#00d164]",
                event.done && "line-through",
              )}
            >
              {event.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {event.subtitle}
            </p>
          </div>
          {event.statusName && event.statusColor && (
            <StatusColorChip
              name={event.statusName}
              color={event.statusColor}
            />
          )}
          {event.priority && <PriorityChip priority={event.priority} />}
          {event.overdue && (
            <span className="chip border-red-400/30 bg-red-400/10 text-red-300">
              Atrasado
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
