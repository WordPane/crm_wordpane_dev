import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import {
  assertProjectAccess,
  requireTeam,
  visibleProjectScope,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  companies,
  milestones,
  projectMembers,
  projects,
  projectStatuses,
  taskStatuses,
  tasks,
  users,
  type Milestone,
  type Project,
  type Task,
} from "@/lib/db/schema";

export type StatusInfo = {
  id: string;
  name: string;
  color: string;
  isFinal: boolean;
};

export type ProjectListItem = {
  id: string;
  name: string;
  type: Project["type"];
  priority: Project["priority"];
  startDate: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  companyId: string;
  companyName: string;
  status: StatusInfo | null;
  ownerName: string | null;
  totalTasks: number;
  doneTasks: number;
};

export type ProjectListFilters = {
  search?: string;
  statusId?: string;
  companyId?: string;
};

/** Lista projetos dentro do escopo do usuário, com progresso de tarefas. */
export async function listProjects(
  user: SessionUser,
  filters: ProjectListFilters = {},
): Promise<ProjectListItem[]> {
  requireTeam(user);
  const scope = await visibleProjectScope(user);
  if (scope && scope.companyIds.length === 0 && scope.projectIds.length === 0) {
    return [];
  }

  const conditions: SQL[] = [];
  if (scope) {
    // Empresa atribuída OU membro do projeto
    const scopeConditions: SQL[] = [];
    if (scope.companyIds.length > 0) {
      scopeConditions.push(inArray(projects.companyId, scope.companyIds));
    }
    if (scope.projectIds.length > 0) {
      scopeConditions.push(inArray(projects.id, scope.projectIds));
    }
    if (scopeConditions.length > 0) conditions.push(or(...scopeConditions)!);
  }
  if (filters.companyId)
    conditions.push(eq(projects.companyId, filters.companyId));
  if (filters.statusId)
    conditions.push(eq(projects.statusId, filters.statusId));

  const q = filters.search?.trim();
  if (q) conditions.push(ilike(projects.name, `%${q}%`));

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      priority: projects.priority,
      startDate: projects.startDate,
      dueDate: projects.dueDate,
      completedAt: projects.completedAt,
      companyId: projects.companyId,
      companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
      statusId: projectStatuses.id,
      statusName: projectStatuses.name,
      statusColor: projectStatuses.color,
      statusIsFinal: projectStatuses.isFinal,
      ownerName: users.name,
    })
    .from(projects)
    .innerJoin(companies, eq(projects.companyId, companies.id))
    .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
    .leftJoin(users, eq(projects.ownerId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(projects.createdAt));

  if (rows.length === 0) return [];

  const progress = await taskProgressByProject(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    priority: r.priority,
    startDate: r.startDate,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
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
    totalTasks: progress.get(r.id)?.total ?? 0,
    doneTasks: progress.get(r.id)?.done ?? 0,
  }));
}

/** Mapa projectId → total/concluídas (status final). */
async function taskProgressByProject(
  projectIds: string[],
): Promise<Map<string, { total: number; done: number }>> {
  const rows = await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${taskStatuses.isFinal})::int`,
    })
    .from(tasks)
    .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
    .where(inArray(tasks.projectId, projectIds))
    .groupBy(tasks.projectId);

  return new Map(rows.map((r) => [r.projectId, { total: r.total, done: r.done }]));
}

// ─────────────────────────── Detalhe ───────────────────────────

export type ProjectMemberItem = {
  id: string;
  name: string;
  email: string;
};

export type MilestoneItem = Milestone & {
  ownerName: string | null;
  totalTasks: number;
  doneTasks: number;
};

export type ProjectTaskItem = {
  id: string;
  title: string;
  priority: Task["priority"];
  dueDate: string | null;
  completedAt: Date | null;
  visibleToClient: boolean;
  milestoneId: string | null;
  origin: Task["origin"];
  status: StatusInfo | null;
  ownerName: string | null;
};

export type ProjectDetail = {
  project: Project;
  company: { id: string; name: string };
  status: StatusInfo | null;
  owner: { id: string; name: string } | null;
  members: ProjectMemberItem[];
  milestones: MilestoneItem[];
  tasks: ProjectTaskItem[];
};

/** Projeto completo — lança ForbiddenError quando fora do escopo. */
export async function getProject(
  user: SessionUser,
  id: string,
): Promise<ProjectDetail | null> {
  requireTeam(user);

  const [row] = await db
    .select({
      project: projects,
      companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
      statusId: projectStatuses.id,
      statusName: projectStatuses.name,
      statusColor: projectStatuses.color,
      statusIsFinal: projectStatuses.isFinal,
      ownerId: users.id,
      ownerName: users.name,
    })
    .from(projects)
    .innerJoin(companies, eq(projects.companyId, companies.id))
    .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
    .leftJoin(users, eq(projects.ownerId, users.id))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) return null;
  await assertProjectAccess(user, row.project);

  const [memberRows, milestoneRows, taskRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, id))
      .orderBy(asc(users.name)),
    db
      .select({ milestone: milestones, ownerName: users.name })
      .from(milestones)
      .leftJoin(users, eq(milestones.ownerId, users.id))
      .where(eq(milestones.projectId, id))
      .orderBy(asc(milestones.position), asc(milestones.createdAt)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        visibleToClient: tasks.visibleToClient,
        milestoneId: tasks.milestoneId,
        origin: tasks.origin,
        statusId: taskStatuses.id,
        statusName: taskStatuses.name,
        statusColor: taskStatuses.color,
        statusIsFinal: taskStatuses.isFinal,
        ownerName: users.name,
      })
      .from(tasks)
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .leftJoin(users, eq(tasks.ownerId, users.id))
      .where(eq(tasks.projectId, id))
      .orderBy(asc(tasks.createdAt)),
  ]);

  // Progresso por etapa (contagem em memória — tarefas já carregadas)
  const perMilestone = new Map<string, { total: number; done: number }>();
  for (const t of taskRows) {
    if (!t.milestoneId) continue;
    const entry = perMilestone.get(t.milestoneId) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (t.statusIsFinal) entry.done += 1;
    perMilestone.set(t.milestoneId, entry);
  }

  return {
    project: row.project,
    company: { id: row.project.companyId, name: row.companyName },
    status: row.statusId
      ? {
          id: row.statusId,
          name: row.statusName!,
          color: row.statusColor!,
          isFinal: row.statusIsFinal!,
        }
      : null,
    owner: row.ownerId ? { id: row.ownerId, name: row.ownerName! } : null,
    members: memberRows,
    milestones: milestoneRows.map((m) => ({
      ...m.milestone,
      ownerName: m.ownerName,
      totalTasks: perMilestone.get(m.milestone.id)?.total ?? 0,
      doneTasks: perMilestone.get(m.milestone.id)?.done ?? 0,
    })),
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      visibleToClient: t.visibleToClient,
      milestoneId: t.milestoneId,
      origin: t.origin,
      status: t.statusId
        ? {
            id: t.statusId,
            name: t.statusName!,
            color: t.statusColor!,
            isFinal: t.statusIsFinal!,
          }
        : null,
      ownerName: t.ownerName,
    })),
  };
}

/** Status de projeto ativos (selects de formulário/filtro). */
export async function listActiveProjectStatuses(
  user: SessionUser,
): Promise<StatusInfo[]> {
  requireTeam(user);
  return db
    .select({
      id: projectStatuses.id,
      name: projectStatuses.name,
      color: projectStatuses.color,
      isFinal: projectStatuses.isFinal,
    })
    .from(projectStatuses)
    .where(eq(projectStatuses.active, true))
    .orderBy(asc(projectStatuses.position), asc(projectStatuses.name));
}
