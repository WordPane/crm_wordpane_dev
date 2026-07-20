import { endOfMonth, format, subDays } from "date-fns";

export type PeriodRange = {
  /** yyyy-MM-dd (inclusive) */
  from: string;
  /** yyyy-MM-dd (inclusive) */
  to: string;
};

/**
 * Converte o parâmetro `periodo` da URL em um intervalo de datas.
 * Aceito: "30d" | "90d" | "YYYY-MM" (mês específico).
 * Qualquer outro valor → null (sem filtro de período).
 */
export function parsePeriod(param: string | undefined): PeriodRange | null {
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const today = new Date();

  if (param === "30d") return { from: fmt(subDays(today, 30)), to: fmt(today) };
  if (param === "90d") return { from: fmt(subDays(today, 90)), to: fmt(today) };

  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) {
    const month = new Date(`${param}-02T00:00:00`);
    return { from: `${param}-01`, to: fmt(endOfMonth(month)) };
  }

  return null;
}
