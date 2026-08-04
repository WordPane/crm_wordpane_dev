import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import {
  assertProjectAccess,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  comments,
  projectMembers,
  projects,
  taskStatuses,
  tasks,
  users,
  type User,
} from "@/lib/db/schema";

export type CommentItem = {
  id: string;
  body: string;
  createdAt: Date;
  /** Comentário respondido (null = comentário raiz). */
  parentId: string | null;
  /** Nomes dos usuários mencionados com @ (para destacar no texto). */
  mentionNames: string[];
  /** Tarefas mencionadas com # (para renderizar links). */
  taskMentions: { id: string; title: string }[];
  author: {
    id: string;
    name: string;
    role: User["role"];
    avatarUrl: string | null;
  } | null;
};

/** Comentários da tarefa em ordem cronológica — lança ForbiddenError fora do escopo. */
export async function listTaskComments(
  user: SessionUser,
  taskId: string,
): Promise<CommentItem[]> {
  requireTeam(user);

  const [task] = await db
    .select({ id: projects.id, companyId: projects.companyId })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return [];
  await assertProjectAccess(user, task);

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      parentId: comments.parentId,
      mentions: comments.mentions,
      taskMentions: comments.taskMentions,
      createdAt: comments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.createdAt));

  // Nomes dos mencionados (para destacar no texto)
  const mentionIds = [
    ...new Set(rows.flatMap((r) => r.mentions ?? [])),
  ] as string[];
  const mentionNames = new Map<string, string>();
  if (mentionIds.length > 0) {
    const mentioned = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, mentionIds));
    for (const u of mentioned) mentionNames.set(u.id, u.name);
  }

  // Títulos das tarefas mencionadas
  const taskMentionIds = [
    ...new Set(rows.flatMap((r) => r.taskMentions ?? [])),
  ] as string[];
  const taskMentionTitles = new Map<string, string>();
  if (taskMentionIds.length > 0) {
    const mentionedTasks = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(inArray(tasks.id, taskMentionIds));
    for (const t of mentionedTasks) taskMentionTitles.set(t.id, t.title);
  }

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    parentId: r.parentId,
    mentionNames: (r.mentions ?? [])
      .map((id) => mentionNames.get(id))
      .filter((name): name is string => Boolean(name)),
    taskMentions: (r.taskMentions ?? [])
      .map((id) => ({ id, title: taskMentionTitles.get(id) ?? "Tarefa" }))
      .filter((t) => t.title),
    author: r.authorId
      ? {
          id: r.authorId,
          name: r.authorName!,
          role: r.authorRole!,
          avatarUrl: r.authorAvatarUrl,
        }
      : null,
  }));
}

/** Comentários do projeto em ordem cronológica — lança ForbiddenError fora do escopo. */
export async function listProjectComments(
  user: SessionUser,
  projectId: string,
): Promise<CommentItem[]> {
  requireTeam(user);

  const [project] = await db
    .select({ id: projects.id, companyId: projects.companyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return [];
  await assertProjectAccess(user, project);

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      parentId: comments.parentId,
      mentions: comments.mentions,
      taskMentions: comments.taskMentions,
      createdAt: comments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorRole: users.role,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.projectId, projectId))
    .orderBy(asc(comments.createdAt));

  // Nomes dos mencionados (para destacar no texto)
  const mentionIds = [
    ...new Set(rows.flatMap((r) => r.mentions ?? [])),
  ] as string[];
  const mentionNames = new Map<string, string>();
  if (mentionIds.length > 0) {
    const mentioned = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, mentionIds));
    for (const u of mentioned) mentionNames.set(u.id, u.name);
  }

  // Títulos das tarefas mencionadas
  const taskMentionIds = [
    ...new Set(rows.flatMap((r) => r.taskMentions ?? [])),
  ] as string[];
  const taskMentionTitles = new Map<string, string>();
  if (taskMentionIds.length > 0) {
    const mentionedTasks = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(inArray(tasks.id, taskMentionIds));
    for (const t of mentionedTasks) taskMentionTitles.set(t.id, t.title);
  }

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    parentId: r.parentId,
    mentionNames: (r.mentions ?? [])
      .map((id) => mentionNames.get(id))
      .filter((name): name is string => Boolean(name)),
    taskMentions: (r.taskMentions ?? [])
      .map((id) => ({ id, title: taskMentionTitles.get(id) ?? "Tarefa" }))
      .filter((t) => t.title),
    author: r.authorId
      ? {
          id: r.authorId,
          name: r.authorName!,
          role: r.authorRole!,
          avatarUrl: r.authorAvatarUrl,
        }
      : null,
  }));
}

export type MentionableUser = {
  id: string;
  name: string;
  role: User["role"];
};

/**
 * Usuários que podem ser mencionados nos comentários da tarefa:
 * - equipe (super_admin/admin) **vinculada ao projeto** (project_members) —
 *   quem não está vinculado não pode ser mencionado;
 * - usuários cliente da empresa do projeto (participam pelo portal).
 */
export async function listMentionableUsers(
  projectId: string,
  companyId: string,
): Promise<MentionableUser[]> {
  const [teamRows, clientRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(users.status, "active"),
          inArray(users.role, ["super_admin", "admin"]),
        ),
      ),
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.status, "active"),
          eq(users.role, "client"),
          eq(users.companyId, companyId),
        ),
      ),
  ]);

  return [...teamRows, ...clientRows].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
}

export type MentionableTask = {
  id: string;
  title: string;
};

/**
 * Tarefas do mesmo projeto que podem ser mencionadas com #.
 * Oculta concluídas por padrão para manter a lista focada.
 */
export async function listMentionableTasks(
  projectId: string,
): Promise<MentionableTask[]> {
  const rows = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
    .where(
      and(
        eq(tasks.projectId, projectId),
        or(isNull(taskStatuses.isFinal), eq(taskStatuses.isFinal, false)),
      ),
    )
    .orderBy(asc(tasks.title));

  return rows;
}
