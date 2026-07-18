import { differenceInCalendarDays, parseISO } from "date-fns";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  requireTeam,
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  activities,
  attachments,
  comments,
  companies,
  demands,
  projects,
  projectStatuses,
  tasks,
  taskStatuses,
  users,
} from "@/lib/db/schema";
import type { ActivityItem } from "@/lib/queries/activities";

export type DashboardCounts = {
  projectsActive: number;
  projectsDone: number;
  projectsOverdue: number;
  demandsOpen: number;
  demandsInProgress: number;
  demandsDone: number;
  clientsActive: number;
};

export type UpcomingItem = {
  kind: "project" | "task";
  id: string;
  title: string;
  /** Empresa (projeto) ou projeto (tarefa). */
  subtitle: string;
  dueDate: string;
  /** Dias até o prazo; negativo = vencido. */
  daysLeft: number;
  href: string;
};

export type DashboardUpload = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
  uploaderName: string | null;
  /** Projeto, tarefa ou demanda onde o arquivo foi anexado. */
  origin: string | null;
  href: string;
};

export type DashboardComment = {
  id: string;
  excerpt: string;
  createdAt: Date;
  authorName: string | null;
  taskTitle: string;
  href: string;
};

export type AdminDashboardData = {
  counts: DashboardCounts;
  upcoming: UpcomingItem[];
  activities: ActivityItem[];
  uploads: DashboardUpload[];
  comments: DashboardComment[];
};

const EMPTY_DATA: AdminDashboardData = {
  counts: {
    projectsActive: 0,
    projectsDone: 0,
    projectsOverdue: 0,
    demandsOpen: 0,
    demandsInProgress: 0,
    demandsDone: 0,
    clientsActive: 0,
  },
  upcoming: [],
  activities: [],
  uploads: [],
  comments: [],
};

/** Visão geral da operação — tudo escopado por visibleCompanyIds. */
export async function getAdminDashboard(
  user: SessionUser,
): Promise<AdminDashboardData> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return EMPTY_DATA;

  const [projectCountRows, demandCountRows, clientCountRows] =
    await Promise.all([
      db
        .select({
          active: sql<number>`count(*) filter (where not coalesce(${projectStatuses.isFinal}, false))::int`,
          done: sql<number>`count(*) filter (where coalesce(${projectStatuses.isFinal}, false))::int`,
          overdue: sql<number>`count(*) filter (where not coalesce(${projectStatuses.isFinal}, false) and ${projects.dueDate} < current_date)::int`,
        })
        .from(projects)
        .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
        .where(scope ? inArray(projects.companyId, scope) : undefined),
      db
        .select({
          open: sql<number>`count(*) filter (where ${demands.status} = 'aberta')::int`,
          inProgress: sql<number>`count(*) filter (where ${demands.status} in ('em_analise', 'em_andamento'))::int`,
          done: sql<number>`count(*) filter (where ${demands.status} = 'concluida')::int`,
        })
        .from(demands)
        .where(scope ? inArray(demands.companyId, scope) : undefined),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(companies)
        .where(
          and(
            eq(companies.status, "ativo"),
            scope ? inArray(companies.id, scope) : undefined,
          ),
        ),
    ]);

  const [upcoming, activityRows, uploadRows, commentRows] = await Promise.all([
    listUpcoming(scope),
    listRecentActivities(scope),
    listRecentUploads(scope),
    listRecentComments(scope),
  ]);

  const projectCounts = projectCountRows[0];
  const demandCounts = demandCountRows[0];

  return {
    counts: {
      projectsActive: projectCounts?.active ?? 0,
      projectsDone: projectCounts?.done ?? 0,
      projectsOverdue: projectCounts?.overdue ?? 0,
      demandsOpen: demandCounts?.open ?? 0,
      demandsInProgress: demandCounts?.inProgress ?? 0,
      demandsDone: demandCounts?.done ?? 0,
      clientsActive: clientCountRows[0]?.value ?? 0,
    },
    upcoming,
    activities: activityRows,
    uploads: uploadRows,
    comments: commentRows,
  };
}

/** Projetos e tarefas com prazo vencido ou nos próximos 30 dias (limite 10). */
async function listUpcoming(
  scope: string[] | null,
): Promise<UpcomingItem[]> {
  const projectConditions: SQL[] = [
    isNotNull(projects.dueDate),
    sql`${projects.dueDate} <= current_date + interval '30 days'`,
    or(isNull(projectStatuses.isFinal), eq(projectStatuses.isFinal, false))!,
  ];
  if (scope) projectConditions.push(inArray(projects.companyId, scope));

  const taskConditions: SQL[] = [
    isNotNull(tasks.dueDate),
    sql`${tasks.dueDate} <= current_date + interval '30 days'`,
    or(isNull(taskStatuses.isFinal), eq(taskStatuses.isFinal, false))!,
    isNull(tasks.completedAt),
  ];
  if (scope) taskConditions.push(inArray(projects.companyId, scope));

  const [projectRows, taskRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        dueDate: projects.dueDate,
        companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
      })
      .from(projects)
      .innerJoin(companies, eq(projects.companyId, companies.id))
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(and(...projectConditions))
      .orderBy(asc(projects.dueDate))
      .limit(10),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(and(...taskConditions))
      .orderBy(asc(tasks.dueDate))
      .limit(10),
  ]);

  const today = new Date();
  const items: UpcomingItem[] = [
    ...projectRows
      .filter((r): r is typeof r & { dueDate: string } => r.dueDate !== null)
      .map((r) => ({
        kind: "project" as const,
        id: r.id,
        title: r.name,
        subtitle: r.companyName,
        dueDate: r.dueDate,
        daysLeft: differenceInCalendarDays(parseISO(r.dueDate), today),
        href: `/admin/projetos/${r.id}`,
      })),
    ...taskRows
      .filter((r): r is typeof r & { dueDate: string } => r.dueDate !== null)
      .map((r) => ({
        kind: "task" as const,
        id: r.id,
        title: r.title,
        subtitle: r.projectName,
        dueDate: r.dueDate,
        daysLeft: differenceInCalendarDays(parseISO(r.dueDate), today),
        href: `/admin/tarefas/${r.id}`,
      })),
  ];

  return items
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 10);
}

/** Últimas 10 atividades das empresas do escopo, com o autor. */
async function listRecentActivities(
  scope: string[] | null,
): Promise<ActivityItem[]> {
  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(activities.companyId, scope));

  const rows = await db
    .select({
      id: activities.id,
      action: activities.action,
      entityType: activities.entityType,
      entityId: activities.entityId,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorRole: users.role,
    })
    .from(activities)
    .leftJoin(users, eq(activities.actorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activities.createdAt))
    .limit(10);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt,
    actor: r.actorId
      ? { id: r.actorId, name: r.actorName!, role: r.actorRole! }
      : null,
  }));
}

/** Últimos 8 anexos do escopo, com autor e origem. */
async function listRecentUploads(
  scope: string[] | null,
): Promise<DashboardUpload[]> {
  const taskProjects = alias(projects, "task_projects");

  const scopeCondition = scope
    ? or(
        inArray(projects.companyId, scope),
        inArray(taskProjects.companyId, scope),
        inArray(demands.companyId, scope),
      )
    : undefined;

  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      createdAt: attachments.createdAt,
      uploaderName: users.name,
      projectName: projects.name,
      taskProjectName: taskProjects.name,
      demandTitle: demands.title,
    })
    .from(attachments)
    .leftJoin(projects, eq(attachments.projectId, projects.id))
    .leftJoin(tasks, eq(attachments.taskId, tasks.id))
    .leftJoin(taskProjects, eq(tasks.projectId, taskProjects.id))
    .leftJoin(demands, eq(attachments.demandId, demands.id))
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(scopeCondition)
    .orderBy(desc(attachments.createdAt))
    .limit(8);

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    origin: r.taskProjectName ?? r.projectName ?? r.demandTitle ?? null,
    href: `/api/files/${r.id}`,
  }));
}

/** Últimos 8 comentários do escopo, com autor e tarefa. */
async function listRecentComments(
  scope: string[] | null,
): Promise<DashboardComment[]> {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorName: users.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
    })
    .from(comments)
    .innerJoin(tasks, eq(comments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(scope ? inArray(projects.companyId, scope) : undefined)
    .orderBy(desc(comments.createdAt))
    .limit(8);

  return rows.map((r) => ({
    id: r.id,
    excerpt: r.body.slice(0, 140),
    createdAt: r.createdAt,
    authorName: r.authorName,
    taskTitle: r.taskTitle,
    href: `/admin/tarefas/${r.taskId}`,
  }));
}
