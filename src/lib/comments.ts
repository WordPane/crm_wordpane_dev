import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { comments, users } from "@/lib/db/schema";
import { notifyUsers } from "@/lib/notifications";

/**
 * Resolve o comentário pai de uma resposta: valida que é da mesma tarefa e
 * achata a thread para 1 nível (resposta a resposta pendura na raiz).
 */
export async function resolveCommentParent(
  taskId: string,
  parentId: string | undefined | null,
): Promise<string | null> {
  if (!parentId) return null;
  const [parent] = await db
    .select({
      id: comments.id,
      taskId: comments.taskId,
      parentId: comments.parentId,
    })
    .from(comments)
    .where(eq(comments.id, parentId))
    .limit(1);
  if (!parent || parent.taskId !== taskId) return null;
  return parent.parentId ?? parent.id;
}

/** Autor do comentário pai (para notificar sobre a resposta). */
export async function getCommentAuthorId(
  commentId: string | null,
): Promise<string | null> {
  if (!commentId) return null;
  const [row] = await db
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  return row?.authorId ?? null;
}

/**
 * Notifica os mencionados com @ (href por role: cliente → portal, equipe →
 * admin) e o autor do comentário respondido ("nova resposta").
 */
export async function notifyCommentMentions(input: {
  mentionIds: string[] | undefined;
  authorId: string;
  authorName: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  excerpt: string;
  parentAuthorId: string | null;
}): Promise<void> {
  const mentionIds = [
    ...new Set((input.mentionIds ?? []).filter((id) => id !== input.authorId)),
  ];
  const mentioned = mentionIds.length
    ? await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(inArray(users.id, mentionIds))
    : [];

  const clientIds = mentioned
    .filter((u) => u.role === "client")
    .map((u) => u.id);
  const teamIds = mentioned
    .filter((u) => u.role !== "client")
    .map((u) => u.id);

  if (clientIds.length > 0) {
    await notifyUsers(clientIds, {
      type: "comment.mention",
      title: `${input.authorName} mencionou você em "${input.taskTitle}"`,
      body: input.excerpt,
      href: `/portal/projetos/${input.projectId}/tarefas/${input.taskId}`,
    });
  }
  if (teamIds.length > 0) {
    await notifyUsers(teamIds, {
      type: "comment.mention",
      title: `${input.authorName} mencionou você em "${input.taskTitle}"`,
      body: input.excerpt,
      href: `/admin/tarefas/${input.taskId}`,
    });
  }

  // Resposta a comentário: avisa o autor do pai (se já não foi mencionado)
  if (
    input.parentAuthorId &&
    input.parentAuthorId !== input.authorId &&
    !mentionIds.includes(input.parentAuthorId)
  ) {
    const [parentAuthor] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.parentAuthorId))
      .limit(1);
    if (parentAuthor) {
      const href =
        parentAuthor.role === "client"
          ? `/portal/projetos/${input.projectId}/tarefas/${input.taskId}`
          : `/admin/tarefas/${input.taskId}`;
      await notifyUsers([input.parentAuthorId], {
        type: "comment.reply",
        title: `${input.authorName} respondeu seu comentário em "${input.taskTitle}"`,
        body: input.excerpt,
        href,
      });
    }
  }
}
