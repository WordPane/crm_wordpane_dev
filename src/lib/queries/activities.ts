import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";

import {
  assertProjectAccess,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  activities,
  attachments,
  comments,
  projects,
  tasks,
  users,
  type User,
} from "@/lib/db/schema";

export type ActivityItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  projectId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  actor: { id: string; name: string; role: User["role"] } | null;
  /** Link direto para a tarefa quando a atividade menciona uma tarefa. */
  href?: string;
  /** Link direto para a etapa quando a atividade menciona uma etapa. */
  milestoneHref?: string;
};

/** Gera o link de admin para uma atividade que menciona tarefa. */
export function activityHref(activity: Pick<ActivityItem, "action" | "entityType" | "entityId" | "metadata">): string | undefined {
  if (activity.entityType === "task" && activity.entityId) {
    return `/admin/tarefas/${activity.entityId}`;
  }
  const m = activity.metadata ?? {};
  const taskId = typeof m.taskId === "string" ? m.taskId : undefined;
  if (!taskId) return undefined;
  if (
    activity.action === "comment.added" ||
    activity.action === "upload.added" ||
    activity.action === "demand.converted"
  ) {
    return `/admin/tarefas/${taskId}`;
  }
  return undefined;
}

/** Gera o link de admin para uma atividade que menciona uma etapa. */
export function activityMilestoneHref(
  activity: Pick<ActivityItem, "projectId" | "metadata">,
): string | undefined {
  const projectId = activity.projectId;
  if (!projectId) return undefined;
  return `/admin/projetos/${projectId}?tab=etapas`;
}

/** Atividades do projeto (mais recentes primeiro, limite 100) — lança ForbiddenError fora do escopo. */
export async function listProjectActivities(
  user: SessionUser,
  projectId: string,
): Promise<ActivityItem[]> {
  requireTeam(user);

  const [project] = await db
    .select({ id: projects.id, companyId: projects.companyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return [];
  await assertProjectAccess(user, project);

  return listByCondition(eq(activities.projectId, projectId));
}

/**
 * Histórico da tarefa: eventos da própria tarefa mais comentários
 * e uploads vinculados a ela.
 */
export async function listTaskActivities(
  user: SessionUser,
  taskId: string,
): Promise<ActivityItem[]> {
  requireTeam(user);

  const [task] = await db
    .select({ id: projects.id, companyId: projects.companyId })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return [];
  await assertProjectAccess(user, task);

  const [commentIds, attachmentIds] = await Promise.all([
    db
      .select({ id: comments.id })
      .from(comments)
      .where(eq(comments.taskId, taskId)),
    db
      .select({ id: attachments.id })
      .from(attachments)
      .where(eq(attachments.taskId, taskId)),
  ]);

  const conditions: SQL[] = [
    and(eq(activities.entityType, "task"), eq(activities.entityId, taskId))!,
  ];
  if (commentIds.length > 0) {
    conditions.push(
      and(
        eq(activities.entityType, "comment"),
        inArray(
          activities.entityId,
          commentIds.map((c) => c.id),
        ),
      )!,
    );
  }
  if (attachmentIds.length > 0) {
    conditions.push(
      and(
        eq(activities.entityType, "attachment"),
        inArray(
          activities.entityId,
          attachmentIds.map((a) => a.id),
        ),
      )!,
    );
  }

  return listByCondition(or(...conditions)!);
}

async function listByCondition(condition: SQL): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: activities.id,
      action: activities.action,
      entityType: activities.entityType,
      entityId: activities.entityId,
      projectId: activities.projectId,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorRole: users.role,
    })
    .from(activities)
    .leftJoin(users, eq(activities.actorId, users.id))
    .where(condition)
    .orderBy(desc(activities.createdAt))
    .limit(100);

  return rows.map((r) => {
    const item: ActivityItem = {
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      projectId: r.projectId,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt,
      actor: r.actorId
        ? { id: r.actorId, name: r.actorName!, role: r.actorRole! }
        : null,
    };
    const href = activityHref(item);
    if (href) item.href = href;
    const milestoneHref = activityMilestoneHref(item);
    if (milestoneHref) item.milestoneHref = milestoneHref;
    return item;
  });
}
