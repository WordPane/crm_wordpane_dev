import { asc, eq } from "drizzle-orm";

import {
  assertCompanyAccess,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { comments, projects, tasks, users, type User } from "@/lib/db/schema";

export type CommentItem = {
  id: string;
  body: string;
  createdAt: Date;
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

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
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
