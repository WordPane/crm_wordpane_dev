import type { Project } from "@/lib/db/schema";

export const calendarEventTypes = [
  "project",
  "milestone",
  "task",
  "charge",
] as const;

export type CalendarEventType = (typeof calendarEventTypes)[number];

/** Cor do tipo "cobrança" (ponto/chip no calendário). */
export const CHARGE_EVENT_COLOR = "#a78bfa";

export type CalendarEvent = {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  type: CalendarEventType;
  title: string;
  /** Empresa (projeto) ou "Projeto · Empresa" (tarefa/etapa). */
  subtitle: string;
  href: string;
  done: boolean;
  /** Vencido antes de hoje e não concluído. */
  overdue: boolean;
  priority?: Project["priority"];
  statusName?: string;
  statusColor?: string;
};

export type CalendarEventFilters = {
  /** yyyy-MM-dd (inclusive). */
  from: string;
  /** yyyy-MM-dd (inclusive). */
  to: string;
  companyId?: string;
  projectId?: string;
  /** Tipos exibidos (vazio/ausente = todos). */
  types?: CalendarEventType[];
};

export type CalendarSummary = {
  vencidos: number;
  hoje: number;
  proximos7: number;
  proximos30: number;
};

export type CalendarFilterOptions = {
  companies: { id: string; name: string }[];
  projects: { id: string; name: string; companyId: string; companyName: string }[];
};
