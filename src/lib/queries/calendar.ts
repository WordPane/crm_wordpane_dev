import { addDays, format } from "date-fns";
import {
  and,
  asc,
  between,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  requireTeam,
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  companies,
  milestones,
  projects,
  projectStatuses,
  tasks,
  taskStatuses,
  type Project,
} from "@/lib/db/schema";
import { milestoneStatusLabels } from "@/lib/validations/project";

export type CalendarEventType = "project" | "milestone" | "task";

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

const companyName = sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`;

/** Data de hoje (local) como yyyy-MM-dd — comparação lexicográfica funciona. */
function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Valida os filtros contra o escopo do usuário.
 * Filtro fora do escopo (ou projeto de outra empresa) é ignorado, sem erro.
 */
async function sanitizeFilters(
  scope: string[] | null,
  filters: CalendarEventFilters,
): Promise<{ companyId?: string; projectId?: string }> {
  let companyId = filters.companyId || undefined;
  if (companyId && scope && !scope.includes(companyId)) companyId = undefined;

  let projectId = filters.projectId || undefined;
  if (projectId) {
    const [row] = await db
      .select({ companyId: projects.companyId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const inScope = row && (!scope || scope.includes(row.companyId));
    const sameCompany = !companyId || row?.companyId === companyId;
    if (!inScope || !sameCompany) projectId = undefined;
  }

  return { companyId, projectId };
}

/** Condições de escopo/filtro sobre a tabela de projetos (direta ou via join). */
function scopeConditions(
  scope: string[] | null,
  companyId: string | undefined,
  projectId: string | undefined,
  projectIdColumn: typeof projects.id | typeof milestones.projectId | typeof tasks.projectId,
): SQL[] {
  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(projects.companyId, scope));
  if (companyId) conditions.push(eq(projects.companyId, companyId));
  if (projectId) conditions.push(eq(projectIdColumn, projectId));
  return conditions;
}

/** Eventos de vencimento (projetos, etapas e tarefas) no intervalo visível. */
export async function getCalendarEvents(
  user: SessionUser,
  filters: CalendarEventFilters,
): Promise<CalendarEvent[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const { companyId, projectId } = await sanitizeFilters(scope, filters);
  const today = todayStr();

  const [projectRows, milestoneRows, taskRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.name,
        dueDate: projects.dueDate,
        priority: projects.priority,
        companyName: companyName,
        statusName: projectStatuses.name,
        statusColor: projectStatuses.color,
        statusIsFinal: projectStatuses.isFinal,
      })
      .from(projects)
      .innerJoin(companies, eq(projects.companyId, companies.id))
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(
        and(
          isNotNull(projects.dueDate),
          between(projects.dueDate, filters.from, filters.to),
          ...scopeConditions(scope, companyId, projectId, projects.id),
        ),
      ),
    db
      .select({
        id: milestones.id,
        title: milestones.name,
        dueDate: milestones.dueDate,
        status: milestones.status,
        projectId: projects.id,
        projectName: projects.name,
        companyName: companyName,
      })
      .from(milestones)
      .innerJoin(projects, eq(milestones.projectId, projects.id))
      .innerJoin(companies, eq(projects.companyId, companies.id))
      .where(
        and(
          isNotNull(milestones.dueDate),
          between(milestones.dueDate, filters.from, filters.to),
          ...scopeConditions(scope, companyId, projectId, milestones.projectId),
        ),
      ),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        projectId: projects.id,
        projectName: projects.name,
        companyName: companyName,
        statusName: taskStatuses.name,
        statusColor: taskStatuses.color,
        statusIsFinal: taskStatuses.isFinal,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .innerJoin(companies, eq(projects.companyId, companies.id))
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(
        and(
          isNotNull(tasks.dueDate),
          between(tasks.dueDate, filters.from, filters.to),
          ...scopeConditions(scope, companyId, projectId, tasks.projectId),
        ),
      ),
  ]);

  const milestoneStatusColors: Record<string, string> = {
    pendente: "#9ca3af",
    em_andamento: "#38bdf8",
    concluida: "#00d164",
  };

  const events: CalendarEvent[] = [
    ...projectRows.map((r): CalendarEvent => {
      const done = r.statusIsFinal === true;
      const date = r.dueDate!;
      return {
        id: r.id,
        date,
        type: "project",
        title: r.title,
        subtitle: r.companyName,
        href: `/admin/projetos/${r.id}`,
        done,
        overdue: !done && date < today,
        priority: r.priority,
        statusName: r.statusName ?? undefined,
        statusColor: r.statusColor ?? undefined,
      };
    }),
    ...milestoneRows.map((r): CalendarEvent => {
      const done = r.status === "concluida";
      const date = r.dueDate!;
      return {
        id: r.id,
        date,
        type: "milestone",
        title: r.title,
        subtitle: `${r.projectName} · ${r.companyName}`,
        href: `/admin/projetos/${r.projectId}?tab=etapas`,
        done,
        overdue: !done && date < today,
        statusName: milestoneStatusLabels[r.status],
        statusColor: milestoneStatusColors[r.status],
      };
    }),
    ...taskRows.map((r): CalendarEvent => {
      const done = r.statusIsFinal === true;
      const date = r.dueDate!;
      return {
        id: r.id,
        date,
        type: "task",
        title: r.title,
        subtitle: `${r.projectName} · ${r.companyName}`,
        href: `/admin/tarefas/${r.id}`,
        done,
        overdue: !done && date < today,
        priority: r.priority,
        statusName: r.statusName ?? undefined,
        statusColor: r.statusColor ?? undefined,
      };
    }),
  ];

  const typeOrder: Record<CalendarEventType, number> = {
    project: 0,
    milestone: 1,
    task: 2,
  };
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      typeOrder[a.type] - typeOrder[b.type] ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
  return events;
}

/** Contagens de vencimentos não concluídos (escopo do usuário, sem filtros). */
export async function getCalendarSummary(
  user: SessionUser,
): Promise<CalendarSummary> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  const empty = { vencidos: 0, hoje: 0, proximos7: 0, proximos30: 0 };
  if (scope && scope.length === 0) return empty;

  const today = todayStr();
  const limit30 = format(addDays(new Date(), 30), "yyyy-MM-dd");
  // Não concluído: status final (projeto/tarefa) ou etapa concluída
  const projectNotDone = or(
    isNull(projectStatuses.isFinal),
    eq(projectStatuses.isFinal, false),
  );
  const taskNotDone = or(
    isNull(taskStatuses.isFinal),
    eq(taskStatuses.isFinal, false),
  );

  const scopeCondition = scope ? [inArray(projects.companyId, scope)] : [];

  const [projectRows, milestoneRows, taskRows] = await Promise.all([
    db
      .select({ dueDate: projects.dueDate })
      .from(projects)
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(
        and(
          isNotNull(projects.dueDate),
          lte(projects.dueDate, limit30),
          projectNotDone,
          ...scopeCondition,
        ),
      ),
    db
      .select({ dueDate: milestones.dueDate })
      .from(milestones)
      .innerJoin(projects, eq(milestones.projectId, projects.id))
      .where(
        and(
          isNotNull(milestones.dueDate),
          lte(milestones.dueDate, limit30),
          ne(milestones.status, "concluida"),
          ...scopeCondition,
        ),
      ),
    db
      .select({ dueDate: tasks.dueDate })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(
        and(
          isNotNull(tasks.dueDate),
          lte(tasks.dueDate, limit30),
          taskNotDone,
          ...scopeCondition,
        ),
      ),
  ]);

  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
  const limit7 = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const summary = { ...empty };
  for (const { dueDate } of [...projectRows, ...milestoneRows, ...taskRows]) {
    const date = dueDate!;
    if (date < today) summary.vencidos += 1;
    else if (date === today) summary.hoje += 1;
    else if (date >= tomorrow && date <= limit7) summary.proximos7 += 1;
    if (date >= tomorrow && date <= limit30) summary.proximos30 += 1;
  }
  return summary;
}

/** Opções dos filtros Empresa/Projeto dentro do escopo, ordenadas por nome. */
export async function getCalendarFilterOptions(
  user: SessionUser,
): Promise<CalendarFilterOptions> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return { companies: [], projects: [] };

  const [companyRows, projectRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companyName })
      .from(companies)
      .where(scope ? inArray(companies.id, scope) : undefined)
      .orderBy(asc(companies.razaoSocial)),
    db
      .select({
        id: projects.id,
        name: projects.name,
        companyId: projects.companyId,
        companyName: companyName,
      })
      .from(projects)
      .innerJoin(companies, eq(projects.companyId, companies.id))
      .where(scope ? inArray(projects.companyId, scope) : undefined)
      .orderBy(asc(projects.name)),
  ]);

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "pt-BR");
  return {
    companies: companyRows.sort(byName),
    projects: projectRows.sort(byName),
  };
}
