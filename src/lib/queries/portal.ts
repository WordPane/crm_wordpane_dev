import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  ForbiddenError,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { SQL_TODAY } from "@/lib/db/business-date";
import {
  activities,
  attachments,
  charges,
  comments,
  companies,
  companyServices,
  demands,
  invoices,
  milestones,
  projectLinks,
  projects,
  projectStatuses,
  quoteItems,
  quotes,
  services,
  taskChecklistItems,
  tasks,
  taskStatuses,
  users,
  type Charge,
  type Demand,
  type Milestone,
  type Project,
  type ProjectLink,
  type Quote,
  type QuoteItem,
  type Task,
  type TaskChecklistItem,
  type User,
} from "@/lib/db/schema";
import type { ActivityItem } from "@/lib/queries/activities";
import type { AttachmentItem } from "@/lib/queries/attachments";
import type { CommentItem } from "@/lib/queries/comments";
import type { StatusInfo } from "@/lib/queries/projects";

/**
 * Queries do portal do cliente. Nunca usam requireTeam: o escopo é sempre
 * a empresa do próprio usuário (role "client") e tarefas visíveis ao cliente.
 */

/** Exige cliente com empresa vinculada e retorna o companyId dele. */
function requireClientCompanyId(user: SessionUser): string {
  if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
  return user.companyId;
}

/** URL de exibição do avatar (servida por /api/avatar/[userId]). */
function avatarSrc(userId: string, avatarUrl: string | null): string | null {
  return avatarUrl ? `/api/avatar/${userId}` : null;
}

export type PortalCompany = { id: string; name: string };

/** Empresa do usuário cliente (layout/saudação). Null quando não é cliente. */
export async function getPortalCompany(
  user: SessionUser,
): Promise<PortalCompany | null> {
  if (user.role !== "client" || !user.companyId) return null;
  const [row] = await db
    .select({
      id: companies.id,
      name: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
    })
    .from(companies)
    .where(eq(companies.id, user.companyId))
    .limit(1);
  return row ?? null;
}

export type PortalProfile = {
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  avatarUrl: string | null;
  isCompanyAdmin: boolean;
  notifyPopup: boolean;
};

/** Dados frescos do próprio usuário (perfil/avatar — a sessão JWT pode estar velha). */
export async function getPortalProfile(
  user: SessionUser,
): Promise<PortalProfile | null> {
  const [row] = await db
    .select({
      name: users.name,
      email: users.email,
      phone: users.phone,
      position: users.position,
      avatarUrl: users.avatarUrl,
      isCompanyAdmin: users.isCompanyAdmin,
      notifyPopup: users.notifyPopup,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return row ?? null;
}

// ─────────────────────────── Usuários da empresa ───────────────────────────

export type PortalCompanyUserItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  status: User["status"];
  isCompanyAdmin: boolean;
};

/** Usuários cliente da própria empresa (gestão pelo admin da empresa). */
export async function listPortalCompanyUsers(
  user: SessionUser,
): Promise<PortalCompanyUserItem[]> {
  const companyId = requireClientCompanyId(user);

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      position: users.position,
      status: users.status,
      isCompanyAdmin: users.isCompanyAdmin,
    })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, "client")))
    .orderBy(asc(users.name));
}

// ─────────────────────────── Projetos ───────────────────────────

export type PortalProjectListItem = {
  id: string;
  name: string;
  type: Project["type"];
  dueDate: string | null;
  status: StatusInfo | null;
  totalTasks: number;
  doneTasks: number;
};

/** Projetos da empresa do cliente, com progresso das tarefas visíveis. */
export async function listPortalProjects(
  user: SessionUser,
): Promise<PortalProjectListItem[]> {
  const companyId = requireClientCompanyId(user);

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      type: projects.type,
      dueDate: projects.dueDate,
      statusId: projectStatuses.id,
      statusName: projectStatuses.name,
      statusColor: projectStatuses.color,
      statusIsFinal: projectStatuses.isFinal,
    })
    .from(projects)
    .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
    .where(eq(projects.companyId, companyId))
    .orderBy(asc(projects.createdAt));

  if (rows.length === 0) return [];

  const progress = await visibleTaskProgressByProject(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    dueDate: r.dueDate,
    status: r.statusId
      ? {
          id: r.statusId,
          name: r.statusName!,
          color: r.statusColor!,
          isFinal: r.statusIsFinal!,
        }
      : null,
    totalTasks: progress.get(r.id)?.total ?? 0,
    doneTasks: progress.get(r.id)?.done ?? 0,
  }));
}

/** Mapa projectId → total/concluídas considerando só tarefas visíveis ao cliente. */
async function visibleTaskProgressByProject(
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
    .where(
      and(
        inArray(tasks.projectId, projectIds),
        eq(tasks.visibleToClient, true),
      ),
    )
    .groupBy(tasks.projectId);

  return new Map(rows.map((r) => [r.projectId, { total: r.total, done: r.done }]));
}

// ─────────────────────────── Dashboard ───────────────────────────

export type PortalUpcomingTask = {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectName: string;
  status: StatusInfo | null;
};

export type PortalDashboardData = {
  activeProjects: number;
  openDemands: number;
  /** Orçamentos enviados aguardando aprovação do cliente. */
  pendingQuotes: number;
  /** Detalhes dos orçamentos pendentes (cards de atenção). */
  pendingQuotesList: {
    id: string;
    number: number;
    title: string;
    totalCents: number;
  }[];
  openChargesCount: number;
  openChargesCents: number;
  overdueChargesCount: number;
  upcomingTasks: PortalUpcomingTask[];
  projects: PortalProjectListItem[];
};

/** Cards-resumo + grid de projetos da home do portal. */
export async function getPortalDashboard(
  user: SessionUser,
): Promise<PortalDashboardData> {
  const companyId = requireClientCompanyId(user);

  const [projectList, upcomingRows, [openDemandsRow], [pendingQuotesRow], pendingQuotesList, [openChargesRow]] =
    await Promise.all([
      listPortalProjects(user),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          projectId: projects.id,
          projectName: projects.name,
          statusId: taskStatuses.id,
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
            isNull(tasks.completedAt),
            sql`${tasks.dueDate} >= ${SQL_TODAY}`,
          ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.createdAt))
        .limit(5),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(demands)
        .where(
          and(
            eq(demands.companyId, companyId),
            inArray(demands.status, ["aberta", "em_analise", "em_andamento"]),
          ),
        ),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(quotes)
        .where(and(eq(quotes.companyId, companyId), eq(quotes.status, "sent"))),
      db
        .select({
          id: quotes.id,
          number: quotes.number,
          title: quotes.title,
          totalCents: quotes.totalCents,
        })
        .from(quotes)
        .where(and(eq(quotes.companyId, companyId), eq(quotes.status, "sent")))
        .orderBy(desc(quotes.number))
        .limit(3),
      db
        .select({
          openCount: sql<number>`count(*) filter (where ${charges.status} in ('pending', 'overdue'))::int`,
          openCents: sql<number>`coalesce(sum(${charges.valueCents}) filter (where ${charges.status} in ('pending', 'overdue')), 0)::int`,
          overdueCount: sql<number>`count(*) filter (where ${charges.status} = 'overdue')::int`,
        })
        .from(charges)
        .where(eq(charges.companyId, companyId)),
    ]);

  return {
    activeProjects: projectList.filter((p) => !p.status?.isFinal).length,
    openDemands: openDemandsRow?.value ?? 0,
    pendingQuotes: pendingQuotesRow?.value ?? 0,
    pendingQuotesList,
    openChargesCount: openChargesRow?.openCount ?? 0,
    openChargesCents: openChargesRow?.openCents ?? 0,
    overdueChargesCount: openChargesRow?.overdueCount ?? 0,
    upcomingTasks: upcomingRows
      .filter((r): r is typeof r & { dueDate: string } => r.dueDate !== null)
      .map((r) => ({
        id: r.id,
        title: r.title,
        dueDate: r.dueDate,
        projectId: r.projectId,
        projectName: r.projectName,
        status: r.statusId
          ? {
              id: r.statusId,
              name: r.statusName!,
              color: r.statusColor!,
              isFinal: r.statusIsFinal!,
            }
          : null,
      })),
    projects: projectList,
  };
}

// ─────────────────────────── Detalhe do projeto ───────────────────────────

export type PortalTaskItem = {
  id: string;
  title: string;
  priority: Task["priority"];
  dueDate: string | null;
  completedAt: Date | null;
  milestoneId: string | null;
  status: StatusInfo | null;
};

export type PortalProjectDetail = {
  project: Project;
  status: StatusInfo | null;
  owner: { id: string; name: string; avatarUrl: string | null } | null;
  milestones: Milestone[];
  tasks: PortalTaskItem[];
  links: ProjectLink[];
  activities: ActivityItem[];
  projectAttachments: AttachmentItem[];
  taskAttachments: (AttachmentItem & { taskTitle: string })[];
};

/** Projeto da empresa do cliente — null quando não existe ou é de outra empresa. */
export async function getPortalProject(
  user: SessionUser,
  id: string,
): Promise<PortalProjectDetail | null> {
  const companyId = requireClientCompanyId(user);

  const [row] = await db
    .select({
      project: projects,
      statusId: projectStatuses.id,
      statusName: projectStatuses.name,
      statusColor: projectStatuses.color,
      statusIsFinal: projectStatuses.isFinal,
      ownerId: users.id,
      ownerName: users.name,
      ownerAvatarUrl: users.avatarUrl,
    })
    .from(projects)
    .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
    .leftJoin(users, eq(projects.ownerId, users.id))
    .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
    .limit(1);

  if (!row) return null;

  const [
    milestoneRows,
    taskRows,
    linkRows,
    activityRows,
    projectAttachmentRows,
    taskAttachmentRows,
    commentRows,
  ] = await Promise.all([
    db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id))
      .orderBy(asc(milestones.position), asc(milestones.createdAt)),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        milestoneId: tasks.milestoneId,
        statusId: taskStatuses.id,
        statusName: taskStatuses.name,
        statusColor: taskStatuses.color,
        statusIsFinal: taskStatuses.isFinal,
      })
      .from(tasks)
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(and(eq(tasks.projectId, id), eq(tasks.visibleToClient, true)))
      .orderBy(asc(tasks.createdAt)),
    db
      .select()
      .from(projectLinks)
      .where(eq(projectLinks.projectId, id))
      .orderBy(desc(projectLinks.createdAt)),
    db
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
      .where(eq(activities.projectId, id))
      .orderBy(desc(activities.createdAt))
      .limit(100),
    db
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        fileSize: attachments.fileSize,
        mimeType: attachments.mimeType,
        createdAt: attachments.createdAt,
        taskId: attachments.taskId,
        uploaderId: users.id,
        uploaderName: users.name,
      })
      .from(attachments)
      .leftJoin(users, eq(attachments.uploadedBy, users.id))
      .where(eq(attachments.projectId, id))
      .orderBy(desc(attachments.createdAt)),
    db
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        fileSize: attachments.fileSize,
        mimeType: attachments.mimeType,
        createdAt: attachments.createdAt,
        taskId: attachments.taskId,
        taskTitle: tasks.title,
        uploaderId: users.id,
        uploaderName: users.name,
      })
      .from(attachments)
      .innerJoin(tasks, eq(attachments.taskId, tasks.id))
      .leftJoin(users, eq(attachments.uploadedBy, users.id))
      .where(and(eq(tasks.projectId, id), eq(tasks.visibleToClient, true)))
      .orderBy(desc(attachments.createdAt)),
    db
      .select({ id: comments.id, taskId: comments.taskId })
      .from(comments)
      .innerJoin(tasks, eq(comments.taskId, tasks.id))
      .where(and(eq(tasks.projectId, id), eq(tasks.visibleToClient, true))),
  ]);

  // Timeline: esconde eventos de tarefas/comentários/anexos não visíveis
  const visibleTaskIds = new Set(taskRows.map((t) => t.id));
  const visibleCommentIds = new Set(commentRows.map((c) => c.id));
  const visibleAttachmentIds = new Set([
    ...projectAttachmentRows.map((a) => a.id),
    ...taskAttachmentRows.map((a) => a.id),
  ]);

  const visibleActivities: ActivityItem[] = activityRows
    .filter((r) => {
      switch (r.entityType) {
        case "task":
          return r.entityId !== null && visibleTaskIds.has(r.entityId);
        case "comment":
          return r.entityId !== null && visibleCommentIds.has(r.entityId);
        case "attachment":
          return r.entityId !== null && visibleAttachmentIds.has(r.entityId);
        default:
          return true;
      }
    })
    .map((r) => ({
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

  return {
    project: row.project,
    status: row.statusId
      ? {
          id: row.statusId,
          name: row.statusName!,
          color: row.statusColor!,
          isFinal: row.statusIsFinal!,
        }
      : null,
    owner: row.ownerId
      ? {
          id: row.ownerId,
          name: row.ownerName!,
          avatarUrl: avatarSrc(row.ownerId, row.ownerAvatarUrl),
        }
      : null,
    milestones: milestoneRows,
    tasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      milestoneId: t.milestoneId,
      status: t.statusId
        ? {
            id: t.statusId,
            name: t.statusName!,
            color: t.statusColor!,
            isFinal: t.statusIsFinal!,
          }
        : null,
    })),
    links: linkRows,
    activities: visibleActivities,
    projectAttachments: projectAttachmentRows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      createdAt: a.createdAt,
      taskId: a.taskId,
      uploader: a.uploaderId ? { id: a.uploaderId, name: a.uploaderName! } : null,
    })),
    taskAttachments: taskAttachmentRows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      createdAt: a.createdAt,
      taskId: a.taskId,
      taskTitle: a.taskTitle,
      uploader: a.uploaderId ? { id: a.uploaderId, name: a.uploaderName! } : null,
    })),
  };
}

// ─────────────────────────── Tarefa do cliente ───────────────────────────

export type PortalTaskDetail = {
  task: Task;
  project: { id: string; name: string };
  milestone: { id: string; name: string } | null;
  status: StatusInfo | null;
  ownerName: string | null;
  checklist: TaskChecklistItem[];
  comments: CommentItem[];
  attachments: AttachmentItem[];
};

/**
 * Tarefa visível ao cliente, de projeto da própria empresa.
 * Null quando fora desse escopo (a página responde notFound).
 */
export async function getPortalTask(
  user: SessionUser,
  projectId: string,
  taskId: string,
): Promise<PortalTaskDetail | null> {
  const companyId = requireClientCompanyId(user);

  const [row] = await db
    .select({ task: tasks, project: projects })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.projectId, projectId),
        eq(projects.companyId, companyId),
        eq(tasks.visibleToClient, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [statusRow, ownerRow, milestoneRow, checklist, commentRows, attachmentRows] =
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
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, row.task.ownerId))
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
        .where(eq(taskChecklistItems.taskId, taskId))
        .orderBy(
          asc(taskChecklistItems.position),
          asc(taskChecklistItems.createdAt),
        ),
      db
        .select({
          id: comments.id,
          body: comments.body,
          parentId: comments.parentId,
          mentions: comments.mentions,
          createdAt: comments.createdAt,
          authorId: users.id,
          authorName: users.name,
          authorRole: users.role,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(comments)
        .leftJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.taskId, taskId))
        .orderBy(asc(comments.createdAt)),
      db
        .select({
          id: attachments.id,
          fileName: attachments.fileName,
          fileSize: attachments.fileSize,
          mimeType: attachments.mimeType,
          createdAt: attachments.createdAt,
          taskId: attachments.taskId,
          uploaderId: users.id,
          uploaderName: users.name,
        })
        .from(attachments)
        .leftJoin(users, eq(attachments.uploadedBy, users.id))
        .where(eq(attachments.taskId, taskId))
        .orderBy(desc(attachments.createdAt)),
    ]);

  // Nomes dos mencionados (para destacar no texto)
  const mentionIds = [
    ...new Set(commentRows.flatMap((c) => c.mentions ?? [])),
  ] as string[];
  const mentionNameMap = new Map<string, string>();
  if (mentionIds.length > 0) {
    const mentioned = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, mentionIds));
    for (const u of mentioned) mentionNameMap.set(u.id, u.name);
  }

  return {
    task: row.task,
    project: { id: row.project.id, name: row.project.name },
    milestone: milestoneRow[0] ?? null,
    status: statusRow[0] ?? null,
    ownerName: ownerRow[0]?.name ?? null,
    checklist,
    comments: commentRows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentId: c.parentId,
      mentionNames: (c.mentions ?? [])
        .map((id) => mentionNameMap.get(id))
        .filter((name): name is string => Boolean(name)),
      author: c.authorId
        ? {
            id: c.authorId,
            name: c.authorName!,
            role: c.authorRole!,
            avatarUrl: avatarSrc(c.authorId, c.authorAvatarUrl),
          }
        : null,
    })),
    attachments: attachmentRows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      createdAt: a.createdAt,
      taskId: a.taskId,
      uploader: a.uploaderId ? { id: a.uploaderId, name: a.uploaderName! } : null,
    })),
  };
}

// ─────────────────────────── Demandas ───────────────────────────

export type PortalDemandItem = {
  id: string;
  title: string;
  category: Demand["category"];
  priority: Demand["priority"];
  status: Demand["status"];
  createdAt: Date;
  /** Projeto ao qual a demanda foi vinculada (null nas antigas). */
  project: { id: string; name: string } | null;
  /** Tarefa vinculada — o link só é exibido quando ela é visível ao cliente. */
  task: { id: string; projectId: string; visible: boolean } | null;
};

/** Demandas da empresa do cliente, mais recentes primeiro. */
export async function listPortalDemands(
  user: SessionUser,
): Promise<PortalDemandItem[]> {
  const companyId = requireClientCompanyId(user);

  const rows = await db
    .select({
      id: demands.id,
      title: demands.title,
      category: demands.category,
      priority: demands.priority,
      status: demands.status,
      createdAt: demands.createdAt,
      projectId: projects.id,
      projectName: projects.name,
      taskId: tasks.id,
      taskProjectId: tasks.projectId,
      taskVisible: tasks.visibleToClient,
    })
    .from(demands)
    .leftJoin(projects, eq(demands.projectId, projects.id))
    .leftJoin(tasks, eq(demands.taskId, tasks.id))
    .where(eq(demands.companyId, companyId))
    .orderBy(desc(demands.createdAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    priority: r.priority,
    status: r.status,
    createdAt: r.createdAt,
    project:
      r.projectId && r.projectName
        ? { id: r.projectId, name: r.projectName }
        : null,
    task:
      r.taskId && r.taskProjectId
        ? { id: r.taskId, projectId: r.taskProjectId, visible: r.taskVisible! }
        : null,
  }));
}

// ─────────────────────────── Arquivos ───────────────────────────

export type PortalFileItem = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
  uploaderName: string | null;
  origin: {
    kind: "project" | "task" | "demand";
    label: string;
    href: string;
  } | null;
};

/**
 * Todos os anexos da empresa: projetos + tarefas visíveis + demandas,
 * com a origem de cada arquivo.
 */
export async function listPortalFiles(
  user: SessionUser,
): Promise<PortalFileItem[]> {
  const companyId = requireClientCompanyId(user);
  const taskProjects = alias(projects, "task_projects");

  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      createdAt: attachments.createdAt,
      projectId: attachments.projectId,
      taskId: attachments.taskId,
      demandId: attachments.demandId,
      uploaderName: users.name,
      projectName: projects.name,
      taskTitle: tasks.title,
      taskProjectId: tasks.projectId,
      demandTitle: demands.title,
    })
    .from(attachments)
    .leftJoin(projects, eq(attachments.projectId, projects.id))
    .leftJoin(tasks, eq(attachments.taskId, tasks.id))
    .leftJoin(taskProjects, eq(tasks.projectId, taskProjects.id))
    .leftJoin(demands, eq(attachments.demandId, demands.id))
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(
      or(
        eq(projects.companyId, companyId),
        and(
          eq(taskProjects.companyId, companyId),
          eq(tasks.visibleToClient, true),
        ),
        eq(demands.companyId, companyId),
      ),
    )
    .orderBy(desc(attachments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    origin:
      r.taskId && r.taskTitle && r.taskProjectId
        ? {
            kind: "task",
            label: r.taskTitle,
            href: `/portal/projetos/${r.taskProjectId}/tarefas/${r.taskId}`,
          }
        : r.projectId && r.projectName
          ? {
              kind: "project",
              label: r.projectName,
              href: `/portal/projetos/${r.projectId}`,
            }
          : r.demandId && r.demandTitle
            ? { kind: "demand", label: r.demandTitle, href: "/portal/demandas" }
            : null,
  }));
}

// ─────────────────────────── Orçamentos ───────────────────────────

export type PortalQuoteListItem = {
  id: string;
  number: number;
  title: string;
  status: Quote["status"];
  totalCents: number;
  validUntil: string | null;
  sentAt: Date | null;
  respondedAt: Date | null;
};

/**
 * Orçamentos enviados à empresa do cliente (rascunhos nunca aparecem),
 * mais recentes primeiro.
 */
export async function listPortalQuotes(
  user: SessionUser,
): Promise<PortalQuoteListItem[]> {
  const companyId = requireClientCompanyId(user);

  return db
    .select({
      id: quotes.id,
      number: quotes.number,
      title: quotes.title,
      status: quotes.status,
      totalCents: quotes.totalCents,
      validUntil: quotes.validUntil,
      sentAt: quotes.sentAt,
      respondedAt: quotes.respondedAt,
    })
    .from(quotes)
    .where(and(eq(quotes.companyId, companyId), ne(quotes.status, "draft")))
    .orderBy(desc(quotes.number));
}

export type PortalQuoteDetail = {
  quote: Quote;
  items: QuoteItem[];
  responderName: string | null;
};

/**
 * Orçamento da empresa do cliente — null quando não existe, é de outra
 * empresa ou ainda é rascunho (a página responde notFound).
 */
export async function getPortalQuote(
  user: SessionUser,
  id: string,
): Promise<PortalQuoteDetail | null> {
  const companyId = requireClientCompanyId(user);

  const [quote] = await db
    .select()
    .from(quotes)
    .where(
      and(
        eq(quotes.id, id),
        eq(quotes.companyId, companyId),
        ne(quotes.status, "draft"),
      ),
    )
    .limit(1);

  if (!quote) return null;

  const [items, responder] = await Promise.all([
    db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(asc(quoteItems.position)),
    quote.respondedBy
      ? db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, quote.respondedBy))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return { quote, items, responderName: responder[0]?.name ?? null };
}

// ─────────────────────────── Financeiro ───────────────────────────

export type PortalChargeItem = {
  id: string;
  description: string;
  valueCents: number;
  billingType: Charge["billingType"];
  dueDate: string;
  status: Charge["status"];
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  paidAt: Date | null;
  createdAt: Date;
  asaasPaymentId: string | null;
  /** Nota fiscal da cobrança (quando emitida). */
  invoice: { id: string; status: "scheduled" | "synchronized" | "authorized" | "error" | "canceled" } | null;
};

/** Cobranças da empresa do cliente (mais recentes primeiro). */
export async function listPortalCharges(
  user: SessionUser,
): Promise<PortalChargeItem[]> {
  const companyId = requireClientCompanyId(user);

  const rows = await db
    .select({
      id: charges.id,
      description: charges.description,
      valueCents: charges.valueCents,
      billingType: charges.billingType,
      dueDate: charges.dueDate,
      status: charges.status,
      invoiceUrl: charges.invoiceUrl,
      bankSlipUrl: charges.bankSlipUrl,
      paidAt: charges.paidAt,
      createdAt: charges.createdAt,
      asaasPaymentId: charges.asaasPaymentId,
      invoiceId: invoices.id,
      invoiceStatus: invoices.status,
    })
    .from(charges)
    .leftJoin(invoices, eq(invoices.chargeId, charges.id))
    .where(eq(charges.companyId, companyId))
    .orderBy(desc(charges.createdAt));

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    valueCents: r.valueCents,
    billingType: r.billingType,
    dueDate: r.dueDate,
    status: r.status,
    invoiceUrl: r.invoiceUrl,
    bankSlipUrl: r.bankSlipUrl,
    paidAt: r.paidAt,
    createdAt: r.createdAt,
    asaasPaymentId: r.asaasPaymentId,
    invoice:
      r.invoiceId && r.invoiceStatus
        ? { id: r.invoiceId, status: r.invoiceStatus }
        : null,
  }));
}

export type PortalSubscriptionItem = {
  id: string;
  valueCents: number;
  billingType: Charge["billingType"];
  createdAt: Date;
  serviceName: string;
  serviceCycle: "weekly" | "monthly" | "quarterly" | "semiannually" | "yearly";
};

/** Assinaturas ativas da empresa do cliente (serviços recorrentes). */
export async function listPortalSubscriptions(
  user: SessionUser,
): Promise<PortalSubscriptionItem[]> {
  const companyId = requireClientCompanyId(user);

  return db
    .select({
      id: companyServices.id,
      valueCents: companyServices.valueCents,
      billingType: companyServices.billingType,
      createdAt: companyServices.createdAt,
      serviceName: services.name,
      serviceCycle: services.cycle,
    })
    .from(companyServices)
    .innerJoin(services, eq(companyServices.serviceId, services.id))
    .where(
      and(
        eq(companyServices.companyId, companyId),
        eq(companyServices.status, "active"),
        eq(services.billing, "recurring"),
      ),
    )
    .orderBy(asc(services.name));
}
