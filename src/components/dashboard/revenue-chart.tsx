import type { RevenueMonth } from "@/lib/queries/dashboard";
import { formatCurrency } from "@/lib/utils/format";

/** "R$ 12,5 mil" / "R$ 800" — rótulo compacto acima das barras. */
function compactCents(cents: number): string {
  const reais = cents / 100;
  if (reais >= 1000) {
    return `R$ ${(reais / 1000).toFixed(1).replace(".", ",")} mil`;
  }
  return `R$ ${Math.round(reais)}`;
}

/** Gráfico de barras em CSS puro — receita dos últimos 6 meses. */
export function RevenueChart({ data }: { data: RevenueMonth[] }) {
  const max = Math.max(...data.map((d) => d.cents), 1);
  const total = data.reduce((sum, d) => sum + d.cents, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-extrabold">{formatCurrency(total)}</p>
        <p className="text-xs text-muted-foreground">nos últimos 6 meses</p>
      </div>

      <div className="flex h-44 items-end gap-2 sm:gap-3">
        {data.map((month) => {
          const height =
            month.cents > 0
              ? Math.max((month.cents / max) * 100, 6)
              : 1.5;
          const isLast = month === data[data.length - 1];
          return (
            <div
              key={month.key}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="text-[0.65rem] font-medium whitespace-nowrap text-muted-foreground">
                {month.cents > 0 ? compactCents(month.cents) : ""}
              </span>
              <div
                className={`w-full rounded-t-md transition-all ${
                  isLast
                    ? "bg-gradient-to-t from-primary/50 to-primary"
                    : "bg-gradient-to-t from-primary/15 to-primary/50"
                }`}
                style={{ height: `${height}%` }}
                title={`${month.label}: ${formatCurrency(month.cents)}`}
              />
              <span className="text-[0.65rem] text-muted-foreground capitalize">
                {month.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
