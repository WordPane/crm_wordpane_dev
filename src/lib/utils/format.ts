import { TZDate } from "@date-fns/tz";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Fuso de exibição da aplicação. A Vercel reserva a env TZ, então o fuso é
 * fixado no código (sobrescrevível via APP_TIMEZONE se um dia precisar).
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Sao_Paulo";

/** String de coluna `date` (YYYY-MM-DD, sem hora)? */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "Hoje" (yyyy-MM-dd) no fuso da aplicação — referência de vencimentos. */
export function businessToday(): string {
  return format(new TZDate(new Date(), APP_TIMEZONE), "yyyy-MM-dd");
}

/** Dias até a data yyyy-MM-dd (negativo = vencida), no fuso da aplicação. */
export function daysUntilDate(dueDate: string): number {
  const msPerDay = 86_400_000;
  return Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) -
      Date.parse(`${businessToday()}T00:00:00Z`)) / msPerDay,
  );
}

/** "22/07/2026" — timestamps convertidos para America/Sao_Paulo. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  // Colunas `date` (sem hora): exibir o dia literal, sem conversão de fuso
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    return format(parseISO(value), "dd/MM/yyyy");
  }
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(new TZDate(d, APP_TIMEZONE), "dd/MM/yyyy");
}

/** "22/07/2026 às 14:35" — sempre em America/Sao_Paulo. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(new TZDate(d, APP_TIMEZONE), "dd/MM/yyyy 'às' HH:mm");
}

/** "há 2 dias" em pt-BR. */
export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

/**
 * Prazo vencido? Comparação por DIA no fuso da aplicação: vence só depois
 * que o dia do prazo passa (não às 21h do dia anterior, como era em UTC).
 */
export function isOverdue(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  // Coluna `date` (sem hora): compara o dia literal
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    return value < businessToday();
  }
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(new TZDate(d, APP_TIMEZONE), "yyyy-MM-dd") < businessToday();
}

/** "R$ 1.234,56" — valores monetários são inteiros em centavos. */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** 1050 → "10,5%" (pontos-base: percentual × 100). */
export function formatPercentBps(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** 7 → "ORC-0007" */
export function formatQuoteNumber(number: number): string {
  return `ORC-${String(number).padStart(4, "0")}`;
}

/** "1,4 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "Maria Souza" → "MS" */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
