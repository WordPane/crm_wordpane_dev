"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertCompanyAccess,
  requireTeam,
  requireUser,
  type SessionUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import { comments, projects, tasks } from "@/lib/db/schema";
import { clientUsersOfCompany, notifyUsers } from "@/lib/notifications";
import { commentFormSchema } from "@/lib/validations/comment";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Comentário + tarefa + projeto, com acesso garantido à empresa do projeto. */
async function getScopedComment(user: SessionUser, commentId: string) {
  const [row] = await db
    .select({ comment: comments, task: tasks, project: projects })
    .from(comments)
    .innerJoin(tasks, eq(comments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row) return null;
  await assertCompanyAccess(user, row.project.companyId);
  return row;
}

export async function createComment(
  taskId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = commentFormSchema.parse(input);

    const [row] = await db
      .select({ task: tasks, project: projects })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!row) return { error: "Tarefa não encontrada." };
    await assertCompanyAccess(user, row.project.companyId);

    const [created] = await db
      .insert(comments)
      .values({ taskId, authorId: user.id, body: data.body })
      .returning({ id: comments.id });

    await logActivity({
      actorId: user.id,
      companyId: row.project.companyId,
      projectId: row.project.id,
      entityType: "comment",
      entityId: created.id,
      action: "comment.added",
      metadata: {
        taskTitle: row.task.title,
        excerpt: data.body.slice(0, 140),
      },
    });

    // Comentário da equipe em tarefa visível → avisa os clientes da empresa
    if (row.task.visibleToClient) {
      const recipients = await clientUsersOfCompany(row.project.companyId);
      await notifyUsers(
        recipients.filter((id) => id !== user.id),
        {
          type: "comment",
          title: `Novo comentário em "${row.task.title}"`,
          body: data.body.slice(0, 140),
          href: `/portal/projetos/${row.project.id}/tarefas/${taskId}`,
        },
      );
    }

    revalidatePath(`/admin/tarefas/${taskId}`);
    revalidatePath(`/admin/projetos/${row.project.id}`);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Só o autor ou super_admin pode excluir. */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedComment(user, commentId);
    if (!scoped) return { error: "Comentário não encontrado." };

    if (scoped.comment.authorId !== user.id && user.role !== "super_admin") {
      return { error: "Você só pode excluir os próprios comentários." };
    }

    await db.delete(comments).where(eq(comments.id, commentId));

    revalidatePath(`/admin/tarefas/${scoped.task.id}`);
    revalidatePath(`/admin/projetos/${scoped.project.id}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
