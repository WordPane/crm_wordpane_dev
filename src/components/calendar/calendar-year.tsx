import {
  addDays,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import {
  capitalize,
  dayViewHref,
  monthViewHref,
} from "@/components/calendar/event-shared";
import type { CalendarEvent } from "@/lib/queries/calendar";
import { cn } from "@/lib/utils";

const WEEKDAY_LETTERS = ["S", "T", "Q", "Q", "S", "S", "D"];

/** Ano em 12 mini-meses; ponto verde (vermelho se atrasado) nos dias com eventos. */
export function CalendarYear({
  events,
  year,
  filtersQuery,
  basePath,
}: {
  events: CalendarEvent[];
  year: number;
  /** Filtros ativos (empresa/projeto) já serializados, para preservar nos links. */
  filtersQuery: string;
  /** Caminho da agenda ("/admin/agenda" ou "/portal/agenda"). */
  basePath: string;
}) {
  const byDate = new Map<string, { count: number; hasOverdue: boolean }>();
  for (const event of events) {
    const entry = byDate.get(event.date) ?? { count: 0, hasOverdue: false };
    entry.count += 1;
    if (event.overdue) entry.hasOverdue = true;
    byDate.set(event.date, entry);
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, monthIndex) => {
        const monthDate = new Date(year, monthIndex, 1);
        const gridStart = startOfWeek(startOfMonth(monthDate), {
          weekStartsOn: 1,
        });
        const days = Array.from({ length: 42 }, (_, i) =>
          addDays(gridStart, i),
        );
        const isCurrent = year === currentYear && monthIndex === currentMonth;

        return (
          <div
            key={monthIndex}
            className={cn(
              "rounded-xl bg-card p-3 ring-1 ring-foreground/10",
              isCurrent && "ring-2 ring-primary",
            )}
          >
            <Link
              href={monthViewHref(basePath, format(monthDate, "yyyy-MM-dd"), filtersQuery)}
              className="mb-2 block text-center text-sm font-semibold transition-colors hover:text-primary"
            >
              {capitalize(format(monthDate, "LLLL", { locale: ptBR }))}
            </Link>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAY_LETTERS.map((letter, i) => (
                <span
                  key={`${letter}-${i}`}
                  className="text-center text-[0.55rem] font-medium text-muted-foreground/50"
                >
                  {letter}
                </span>
              ))}
              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const inMonth = isSameMonth(day, monthDate);
                if (!inMonth) return <span key={dateStr} />;

                const entry = byDate.get(dateStr);
                const isToday = dateStr === today;
                const dayNumber = (
                  <>
                    <span
                      className={cn(
                        "text-[0.6rem] leading-none",
                        isToday
                          ? "font-bold text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <span
                      className={cn("size-1 rounded-full", !entry && "invisible")}
                      style={
                        entry
                          ? {
                              backgroundColor: entry.hasOverdue
                                ? "#ff6b6b"
                                : "var(--green)",
                            }
                          : undefined
                      }
                    />
                  </>
                );

                const cellClass =
                  "flex flex-col items-center gap-0.5 rounded py-0.5";
                return entry ? (
                  <Link
                    key={dateStr}
                    href={dayViewHref(basePath, dateStr, filtersQuery)}
                    title={`${entry.count} ${
                      entry.count === 1 ? "vencimento" : "vencimentos"
                    }`}
                    className={cn(cellClass, "transition-colors hover:bg-muted")}
                  >
                    {dayNumber}
                  </Link>
                ) : (
                  <span key={dateStr} className={cellClass}>
                    {dayNumber}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
