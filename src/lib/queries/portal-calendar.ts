import { addDays, format, parseISO } from "date-fns";
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
} from "drizzle-orm";

import {
  ForbiddenError,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  charges,
  companies,
  milestones,
  projects,
  projectStatuses,
  tasks,
  taskStatuses,
} from "@/lib/db/schema";
import {
  CHARGE_EVENT_COLOR,
  type CalendarEvent,
  type CalendarSummary,
} from "@/lib/queries/calendar";
import { chargeStatusLabels } from "@/lib/validations/finance";
import { milestoneStatusLabels } from "@/lib/validations/project";
import { businessToday, formatCurrency } from "@/lib/utils/format";

/**
 * Agenda do portal: mesmos eventos da agenda interna, mas escopados à
 * empresa do cliente e limitados a tarefas visíveis ao cliente.
 */

const companyName = sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`;

function requireClientCompanyId(user: SessionUser): string {
  if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
  return user.companyId;
}

function todayStr(): string {
  return businessToday();
}

const milestoneStatusColors: Record<string, string> = {
  pendente: "#9ca3af",
  em_andamento: "#38bdf8",
  concluida: "var(--green)",
};

/** Eventos de vencimento (projetos, etapas e tarefas visíveis) da empresa. */
export async function getPortalCalendarEvents(
  user: SessionUser,
  filters: {
    from: string;
    to: string;
    projectId?: string;
    /** Tipos exibidos (vazio/ausente = todos). */
    types?: CalendarEvent["type"][];
  },
): Promise<CalendarEvent[]> {
  const companyId = requireClientCompanyId(user);
  const today = todayStr();
  const projectFilter = filters.projectId
    ? eq(projects.id, filters.projectId)
    : undefined;

  const [projectRows, milestoneRows, taskRows, chargeRows] = await Promise.all([
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
          eq(projects.companyId, companyId),
          isNotNull(projects.dueDate),
          between(projects.dueDate, filters.from, filters.to),
          projectFilter,
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
      })
      .from(milestones)
      .innerJoin(projects, eq(milestones.projectId, projects.id))
      .where(
        and(
          eq(projects.companyId, companyId),
          isNotNull(milestones.dueDate),
          between(milestones.dueDate, filters.from, filters.to),
          projectFilter,
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
        statusName: taskStatuses.name,
        statusColor: taskStatuses.color,
        statusIsFinal: taskStatuses.isFinal,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(
        and(
          eq(projects.companyId, companyId),
          eq(tasks.visibleToClient, true),
          isNotNull(tasks.dueDate),
          between(tasks.dueDate, filters.from, filters.to),
          projectFilter,
        ),
      ),
    // Cobranças em aberto da empresa — sem vínculo com projeto
    filters.projectId
      ? Promise.resolve([])
      : db
          .select({
            id: charges.id,
            title: charges.description,
            dueDate: charges.dueDate,
            valueCents: charges.valueCents,
            status: charges.status,
          })
          .from(charges)
          .where(
            and(
              eq(charges.companyId, companyId),
              inArray(charges.status, ["pending", "overdue"]),
              between(charges.dueDate, filters.from, filters.to),
            ),
          ),
  ]);

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
        href: `/portal/projetos/${r.id}`,
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
        subtitle: r.projectName,
        href: `/portal/projetos/${r.projectId}`,
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
        subtitle: r.projectName,
        href: `/portal/projetos/${r.projectId}/tarefas/${r.id}`,
        done,
        overdue: !done && date < today,
        priority: r.priority,
        statusName: r.statusName ?? undefined,
        statusColor: r.statusColor ?? undefined,
      };
    }),
    ...chargeRows.map((r): CalendarEvent => {
      const date = r.dueDate;
      return {
        id: r.id,
        date,
        type: "charge",
        title: r.title,
        subtitle: formatCurrency(r.valueCents),
        href: "/portal/financeiro",
        done: false,
        overdue: date < today,
        statusName: chargeStatusLabels[r.status],
        statusColor: CHARGE_EVENT_COLOR,
      };
    }),
  ];

  const typeOrder = { project: 0, milestone: 1, task: 2, charge: 3 } as const;
  // Filtro por tipo (a query é a mesma; filtrar aqui mantém as 4 consultas paralelas)
  const typeFilter = filters.types?.length ? filters.types : null;
  const filtered = typeFilter
    ? events.filter((event) => typeFilter.includes(event.type))
    : events;
  filtered.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      typeOrder[a.type] - typeOrder[b.type] ||
      a.title.localeCompare(b.title, "pt-BR"),
  );
  return filtered;
}

/** Contagens de vencimentos não concluídos da empresa do cliente. */
export async function getPortalCalendarSummary(
  user: SessionUser,
): Promise<CalendarSummary> {
  const companyId = requireClientCompanyId(user);

  const today = todayStr();
  const limit30 = format(addDays(parseISO(today), 30), "yyyy-MM-dd");
  const projectNotDone = or(
    isNull(projectStatuses.isFinal),
    eq(projectStatuses.isFinal, false),
  );
  const taskNotDone = or(
    isNull(taskStatuses.isFinal),
    eq(taskStatuses.isFinal, false),
  );

  const [projectRows, milestoneRows, taskRows, chargeRows] = await Promise.all([
    db
      .select({ dueDate: projects.dueDate })
      .from(projects)
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(
        and(
          eq(projects.companyId, companyId),
          isNotNull(projects.dueDate),
          lte(projects.dueDate, limit30),
          projectNotDone,
        ),
      ),
    db
      .select({ dueDate: milestones.dueDate })
      .from(milestones)
      .innerJoin(projects, eq(milestones.projectId, projects.id))
      .where(
        and(
          eq(projects.companyId, companyId),
          isNotNull(milestones.dueDate),
          lte(milestones.dueDate, limit30),
          ne(milestones.status, "concluida"),
        ),
      ),
    db
      .select({ dueDate: tasks.dueDate })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(
        and(
          eq(projects.companyId, companyId),
          eq(tasks.visibleToClient, true),
          isNotNull(tasks.dueDate),
          lte(tasks.dueDate, limit30),
          taskNotDone,
        ),
      ),
    db
      .select({ dueDate: charges.dueDate })
      .from(charges)
      .where(
        and(
          eq(charges.companyId, companyId),
          inArray(charges.status, ["pending", "overdue"]),
          lte(charges.dueDate, limit30),
        ),
      ),
  ]);

  const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
  const limit7 = format(addDays(parseISO(today), 7), "yyyy-MM-dd");

  const summary = { vencidos: 0, hoje: 0, proximos7: 0, proximos30: 0 };
  for (const { dueDate } of [
    ...projectRows,
    ...milestoneRows,
    ...taskRows,
    ...chargeRows,
  ]) {
    const date = dueDate!;
    if (date < today) summary.vencidos += 1;
    else if (date === today) summary.hoje += 1;
    else if (date >= tomorrow && date <= limit7) summary.proximos7 += 1;
    if (date >= tomorrow && date <= limit30) summary.proximos30 += 1;
  }
  return summary;
}

/** Projetos da empresa do cliente (filtro da agenda). */
export async function listPortalCalendarProjects(
  user: SessionUser,
): Promise<{ id: string; name: string; companyId: string; companyName: string }[]> {
  const companyId = requireClientCompanyId(user);

  return db
    .select({
      id: projects.id,
      name: projects.name,
      companyId: projects.companyId,
      companyName: companyName,
    })
    .from(projects)
    .innerJoin(companies, eq(projects.companyId, companies.id))
    .where(eq(projects.companyId, companyId))
    .orderBy(asc(projects.name));
}
