import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";

import {
  assertCompanyAccess,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  adminCompanyAssignments,
  comments,
  projects,
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
    .select({ companyId: projects.companyId })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return [];
  await assertCompanyAccess(user, task.companyId);

  const rows = await db
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

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    parentId: r.parentId,
    mentionNames: (r.mentions ?? [])
      .map((id) => mentionNames.get(id))
      .filter((name): name is string => Boolean(name)),
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
 * Usuários que podem ser mencionados nos comentários: equipe vinculada à
 * empresa (super admins + admins atribuídos) e usuários cliente da empresa.
 */
export async function listMentionableUsers(
  companyId: string,
): Promise<MentionableUser[]> {
  const assigned = await db
    .select({ adminId: adminCompanyAssignments.adminId })
    .from(adminCompanyAssignments)
    .where(eq(adminCompanyAssignments.companyId, companyId));
  const assignedIds = assigned.map((r) => r.adminId);

  const teamConditions: SQL[] = [eq(users.role, "super_admin")];
  if (assignedIds.length > 0) {
    teamConditions.push(
      and(eq(users.role, "admin"), inArray(users.id, assignedIds))!,
    );
  }

  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        or(
          or(...teamConditions),
          and(eq(users.role, "client"), eq(users.companyId, companyId)),
        ),
      ),
    )
    .orderBy(asc(users.name));

  return rows;
}
