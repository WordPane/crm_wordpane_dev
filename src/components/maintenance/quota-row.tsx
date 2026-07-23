/** Linha de cota com barra de progresso (usado/limite + créditos de pacotes). */
export function QuotaRow({
  label,
  used,
  limit,
  credits,
}: {
  label: string;
  used: number;
  limit: number;
  credits: number;
}) {
  const pct =
    limit > 0
      ? Math.min(Math.round((used / limit) * 100), 100)
      : used > 0
        ? 100
        : 0;
  const exhausted = used >= limit && credits <= 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={
            exhausted ? "font-semibold text-[#ff6b6b]" : "font-semibold"
          }
        >
          {used}/{limit}
          {credits > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">
              (+{credits} extras)
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${exhausted ? "bg-[#ff6b6b]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
