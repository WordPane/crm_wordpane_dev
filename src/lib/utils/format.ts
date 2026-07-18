import { format, formatDistanceToNow, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/** "22/07/2026" — aceita Date ou string ISO/date. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "dd/MM/yyyy");
}

/** "22/07/2026 às 14:35" — aceita Date ou string ISO. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return format(d, "dd/MM/yyyy 'às' HH:mm");
}

/** "há 2 dias" em pt-BR. */
export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

/** Data de prazo já venceu? (ignora valores nulos) */
export function isOverdue(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const d = typeof value === "string" ? parseISO(value) : value;
  return isPast(d);
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
