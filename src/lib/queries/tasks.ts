import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";

import {
  assertCompanyAccess,
  requireTeam,
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  companies,
  milestones,
  projects,
  taskChecklistItems,
  tasks,
  taskStatuses,
  users,
  type Task,
  type TaskChecklistItem,
} from "@/lib/db/schema";
import type { StatusInfo } from "@/lib/queries/projects";

export type TaskListItem = {
  id: string;
  title: string;
  priority: Task["priority"];
  dueDate: string | null;
  completedAt: Date | null;
  projectId: string;
  projectName: string;
  companyId: string;
  companyName: string;
  status: StatusInfo | null;
  ownerName: string | null;
};

export type TaskListFilters = {
  statusId?: string;
  priority?: Task["priority"];
  projectId?: string;
};

/** Lista global de tarefas (escopo de empresas aplicado via projeto). */
export async function listTasks(
  user: SessionUser,
  filters: TaskListFilters = {},
): Promise<TaskListItem[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(projects.companyId, scope));
  if (filters.statusId) conditions.push(eq(tasks.statusId, filters.statusId));
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));
  if (filters.projectId) conditions.push(eq(tasks.projectId, filters.projectId));

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      projectId: projects.id,
      projectName: projects.name,
      companyId: companies.id,
      companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
      statusId: taskStatuses.id,
      statusName: taskStatuses.name,
      statusColor: taskStatuses.color,
      statusIsFinal: taskStatuses.isFinal,
      ownerName: users.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(companies, eq(projects.companyId, companies.id))
    .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
    .leftJoin(users, eq(tasks.ownerId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(tasks.createdAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    priority: r.priority,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    projectId: r.projectId,
    projectName: r.projectName,
    companyId: r.companyId,
    companyName: r.companyName,
    status: r.statusId
      ? {
          id: r.statusId,
          name: r.statusName!,
          color: r.statusColor!,
          isFinal: r.statusIsFinal!,
        }
      : null,
    ownerName: r.ownerName,
  }));
}

// ─────────────────────────── Detalhe ───────────────────────────

export type TaskDetail = {
  task: Task;
  project: { id: string; name: string };
  company: { id: string; name: string };
  milestone: { id: string; name: string } | null;
  status: StatusInfo | null;
  owner: { id: string; name: string } | null;
  creator: { id: string; name: string } | null;
  checklist: TaskChecklistItem[];
};

/** Tarefa completa — lança ForbiddenError quando fora do escopo. */
export async function getTask(
  user: SessionUser,
  id: string,
): Promise<TaskDetail | null> {
  requireTeam(user);

  const [row] = await db
    .select({ task: tasks, project: projects, company: companies })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(companies, eq(projects.companyId, companies.id))
    .where(eq(tasks.id, id))
    .limit(1);

  if (!row) return null;
  await assertCompanyAccess(user, row.project.companyId);

  const [statusRow, ownerRow, creatorRow, milestoneRow, checklist] =
    await Promise.all([
      row.task.statusId
        ? db
            .select({
              id: taskStatuses.id,
              name: taskStatuses.name,
              color: taskStatuses.color,
              isFinal: taskStatuses.isFinal,
            })
            .from(taskStatuses)
            .where(eq(taskStatuses.id, row.task.statusId))
            .limit(1)
        : Promise.resolve([]),
      row.task.ownerId
        ? db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(eq(users.id, row.task.ownerId))
            .limit(1)
        : Promise.resolve([]),
      row.task.createdBy
        ? db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(eq(users.id, row.task.createdBy))
            .limit(1)
        : Promise.resolve([]),
      row.task.milestoneId
        ? db
            .select({ id: milestones.id, name: milestones.name })
            .from(milestones)
            .where(eq(milestones.id, row.task.milestoneId))
            .limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.taskId, id))
        .orderBy(asc(taskChecklistItems.position), asc(taskChecklistItems.createdAt)),
    ]);

  return {
    task: row.task,
    project: { id: row.project.id, name: row.project.name },
    company: {
      id: row.company.id,
      name: row.company.nomeFantasia || row.company.razaoSocial,
    },
    milestone: milestoneRow[0] ?? null,
    status: statusRow[0] ?? null,
    owner: ownerRow[0] ?? null,
    creator: creatorRow[0] ?? null,
    checklist,
  };
}

/** Status de tarefa ativos (selects de formulário/filtro). */
export async function listActiveTaskStatuses(
  user: SessionUser,
): Promise<StatusInfo[]> {
  requireTeam(user);
  return db
    .select({
      id: taskStatuses.id,
      name: taskStatuses.name,
      color: taskStatuses.color,
      isFinal: taskStatuses.isFinal,
    })
    .from(taskStatuses)
    .where(eq(taskStatuses.active, true))
    .orderBy(asc(taskStatuses.position), asc(taskStatuses.name));
}

/** Etapas de um projeto (para o seletor de etapa da tarefa). */
export async function listProjectMilestonesForTask(
  user: SessionUser,
  projectId: string,
): Promise<{ id: string; name: string }[]> {
  requireTeam(user);
  const [project] = await db
    .select({ companyId: projects.companyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return [];
  await assertCompanyAccess(user, project.companyId);
  return db
    .select({ id: milestones.id, name: milestones.name })
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.position), asc(milestones.name));
}
