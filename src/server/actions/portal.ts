"use server";

import { compare, hashSync } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  ForbiddenError,
  requireUser,
  type SessionUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import {
  getCommentAuthorId,
  notifyCommentMentions,
  resolveCommentParent,
} from "@/lib/comments";
import { db } from "@/lib/db";
import {
  attachments,
  comments,
  demands,
  projects,
  tasks,
  users,
} from "@/lib/db/schema";
import { notifyUsers, teamUsersOfCompany } from "@/lib/notifications";
import {
  allocateQuota,
  PaymentPendingError,
  paymentPendingMessage,
  QuotaExceededError,
  quotaExceededMessage,
  usageKindForCategory,
} from "@/lib/queries/maintenance";
import { getStorage } from "@/lib/storage";
import { attachmentFormSchema } from "@/lib/validations/attachment";
import {
  portalCommentSchema,
  portalDemandSchema,
  portalPasswordSchema,
  portalProfileSchema,
} from "@/lib/validations/portal";
import {
  actionError,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

/**
 * Actions do portal do cliente. Nunca usam requireTeam: cada operação
 * confere a empresa do próprio usuário e, para tarefas, visibleToClient.
 */

/** Exige cliente com empresa vinculada e retorna o companyId dele. */
async function requireClient(user: SessionUser): Promise<string> {
  if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
  return user.companyId;
}

function revalidatePortalProject(projectId: string) {
  revalidatePath(`/portal/projetos/${projectId}`);
  revalidatePath("/portal/projetos");
  revalidatePath("/portal/arquivos");
  revalidatePath("/portal/dashboard");
}

// ─────────────────────────── Comentários ───────────────────────────

/** Comentário do cliente em tarefa visível da própria empresa. */
export async function createPortalComment(
  taskId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const companyId = await requireClient(user);
    const data = portalCommentSchema.parse(input);

    const [row] = await db
      .select({ task: tasks, project: projects })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.id, taskId),
          eq(projects.companyId, companyId),
          eq(tasks.visibleToClient, true),
        ),
      )
      .limit(1);
    if (!row) return { error: "Tarefa não encontrada." };

    const parentId = await resolveCommentParent(taskId, data.parentId);
    const parentAuthorId = parentId
      ? await getCommentAuthorId(parentId)
      : null;

    const [created] = await db
      .insert(comments)
      .values({
        taskId,
        authorId: user.id,
        parentId,
        mentions: data.mentions ?? null,
        body: data.body,
      })
      .returning({ id: comments.id });

    await logActivity({
      actorId: user.id,
      companyId,
      projectId: row.project.id,
      entityType: "comment",
      entityId: created.id,
      action: "comment.added",
      metadata: {
        taskTitle: row.task.title,
        excerpt: data.body.slice(0, 140),
      },
    });

    // Comentário do cliente → avisa a equipe da empresa
    const commentRecipients = await teamUsersOfCompany(companyId);
    await notifyUsers(
      commentRecipients.filter((id) => id !== user.id),
      {
        type: "comment",
        title: `${user.name} comentou em "${row.task.title}"`,
        body: data.body.slice(0, 140),
        href: `/admin/tarefas/${taskId}`,
      },
    );

    // Menções com @ e resposta a comentário
    await notifyCommentMentions({
      mentionIds: data.mentions,
      authorId: user.id,
      authorName: user.name,
      taskId,
      taskTitle: row.task.title,
      projectId: row.project.id,
      excerpt: data.body.slice(0, 140),
      parentAuthorId,
    });

    revalidatePath(`/portal/projetos/${row.project.id}/tarefas/${taskId}`);
    revalidatePortalProject(row.project.id);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Anexos ───────────────────────────

type PortalAttachmentTarget = {
  projectId: string;
  /** Contexto para o texto da atividade (título da tarefa ou nome do projeto). */
  targetName: string;
};

/**
 * Resolve o alvo de um anexo do portal: projeto da empresa do cliente ou
 * tarefa visível ao cliente (demandas recebem anexos só na criação).
 */
async function resolvePortalTarget(
  companyId: string,
  data: { taskId?: string; projectId?: string },
): Promise<PortalAttachmentTarget | null> {
  if (data.taskId) {
    const [row] = await db
      .select({
        projectId: projects.id,
        taskTitle: tasks.title,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.id, data.taskId),
          eq(projects.companyId, companyId),
          eq(tasks.visibleToClient, true),
        ),
      )
      .limit(1);
    return row
      ? { projectId: row.projectId, targetName: row.taskTitle }
      : null;
  }
  if (data.projectId) {
    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.companyId, companyId)))
      .limit(1);
    return project
      ? { projectId: project.id, targetName: project.name }
      : null;
  }
  return null;
}

/** Upload do cliente no nível do projeto ou de tarefa visível. */
export async function createPortalAttachment(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const companyId = await requireClient(user);
    const data = attachmentFormSchema.parse(input);

    const target = await resolvePortalTarget(companyId, {
      taskId: data.taskId || undefined,
      projectId: data.projectId || undefined,
    });
    if (!target) return { error: "Destino do anexo não encontrado." };

    const [created] = await db
      .insert(attachments)
      .values({
        taskId: data.taskId || null,
        projectId: data.projectId || null,
        demandId: null,
        uploadedBy: user.id,
        fileName: data.fileName,
        fileKey: data.fileKey,
        fileSize: data.fileSize,
        mimeType: data.mimeType || null,
      })
      .returning({ id: attachments.id });

    await logActivity({
      actorId: user.id,
      companyId,
      projectId: target.projectId,
      entityType: "attachment",
      entityId: created.id,
      action: "upload.added",
      metadata: { fileName: data.fileName, target: target.targetName },
    });

    // Upload do cliente → avisa a equipe da empresa
    const uploadRecipients = await teamUsersOfCompany(companyId);
    await notifyUsers(
      uploadRecipients.filter((id) => id !== user.id),
      {
        type: "upload",
        title: `${user.name} anexou ${data.fileName}`,
        body: `Enviado em "${target.targetName}".`,
        href: data.taskId
          ? `/admin/tarefas/${data.taskId}`
          : `/admin/projetos/${target.projectId}`,
      },
    );

    if (data.taskId) {
      revalidatePath(`/portal/projetos/${target.projectId}/tarefas/${data.taskId}`);
    }
    revalidatePortalProject(target.projectId);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

/** O cliente só exclui arquivos que ele mesmo enviou (da própria empresa). */
export async function deletePortalAttachment(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const companyId = await requireClient(user);

    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    if (!attachment) return { error: "Arquivo não encontrado." };

    // Empresa dona do anexo: via tarefa→projeto, projeto ou demanda
    let ownerCompanyId: string | null = null;
    let projectId: string | null = attachment.projectId;
    if (attachment.taskId) {
      const [row] = await db
        .select({ companyId: projects.companyId, projectId: projects.id })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.id, attachment.taskId))
        .limit(1);
      ownerCompanyId = row?.companyId ?? null;
      projectId = row?.projectId ?? null;
    } else if (attachment.projectId) {
      const [row] = await db
        .select({ companyId: projects.companyId })
        .from(projects)
        .where(eq(projects.id, attachment.projectId))
        .limit(1);
      ownerCompanyId = row?.companyId ?? null;
    } else if (attachment.demandId) {
      const [row] = await db
        .select({ companyId: demands.companyId })
        .from(demands)
        .where(eq(demands.id, attachment.demandId))
        .limit(1);
      ownerCompanyId = row?.companyId ?? null;
    }

    if (!ownerCompanyId || ownerCompanyId !== companyId) {
      return { error: "Arquivo não encontrado." };
    }
    if (attachment.uploadedBy !== user.id) {
      return { error: "Você só pode excluir os arquivos que enviou." };
    }

    await db.delete(attachments).where(eq(attachments.id, id));
    await getStorage().delete(attachment.fileKey);

    if (attachment.taskId && projectId) {
      revalidatePath(`/portal/projetos/${projectId}/tarefas/${attachment.taskId}`);
    }
    if (projectId) revalidatePortalProject(projectId);
    revalidatePath("/portal/demandas");
    revalidatePath("/portal/arquivos");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Demandas ───────────────────────────

/** Cria a demanda da empresa do cliente + anexos opcionais (transaction). */
export async function createPortalDemand(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const companyId = await requireClient(user);
    const data = portalDemandSchema.parse(input);

    // O projeto precisa ser da própria empresa do cliente
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.companyId, companyId)))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };

    const demandId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(demands)
        .values({
          companyId,
          projectId: data.projectId,
          title: data.title,
          description: data.description,
          category: data.category,
          priority: data.priority,
          createdBy: user.id,
        })
        .returning({ id: demands.id });

      // Projeto com plano de manutenção → consome cota (sem plano = no-op)
      const kind = usageKindForCategory(data.category);
      const allocation = await allocateQuota(tx, data.projectId, kind, created.id);
      if (allocation === "quota_exceeded") throw new QuotaExceededError(kind);
      if (allocation === "payment_pending") throw new PaymentPendingError();

      if (data.attachments && data.attachments.length > 0) {
        await tx.insert(attachments).values(
          data.attachments.map((file) => ({
            demandId: created.id,
            uploadedBy: user.id,
            fileName: file.fileName,
            fileKey: file.fileKey,
            fileSize: file.fileSize,
            mimeType: file.mimeType || null,
          })),
        );
      }

      return created.id;
    });

    await logActivity({
      actorId: user.id,
      companyId,
      entityType: "demand",
      entityId: demandId,
      action: "demand.created",
      metadata: { title: data.title },
    });

    // Nova demanda do cliente → avisa a equipe da empresa
    const demandRecipients = await teamUsersOfCompany(companyId);
    await notifyUsers(
      demandRecipients.filter((id) => id !== user.id),
      {
        type: "demand.created",
        title: `Nova demanda: "${data.title}"`,
        body: data.description.slice(0, 140),
        href: "/admin/demandas",
      },
    );

    revalidatePath("/portal/demandas");
    revalidatePath("/portal/arquivos");
    revalidatePath("/portal/dashboard");
    return { success: true, id: demandId };
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return { error: quotaExceededMessage(error.kind) };
    }
    if (error instanceof PaymentPendingError) {
      return { error: paymentPendingMessage() };
    }
    return actionError(error);
  }
}

// ─────────────────────────── Perfil ───────────────────────────

/** Atualiza os dados do próprio usuário cliente (nome, telefone, cargo). */
export async function updatePortalProfile(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await requireClient(user);
    const data = portalProfileSchema.parse(input);

    await db
      .update(users)
      .set({
        name: data.name,
        phone: nullIfEmpty(data.phone),
        position: nullIfEmpty(data.position),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, user.id), eq(users.role, "client")));

    revalidatePath("/portal/perfil");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Troca a senha do próprio usuário após conferir a senha atual. */
export async function changePortalPassword(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await requireClient(user);
    const data = portalPasswordSchema.parse(input);

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!row) return { error: "Usuário não encontrado." };

    const valid = await compare(data.currentPassword, row.passwordHash);
    if (!valid) return { error: "A senha atual está incorreta." };

    await db
      .update(users)
      .set({
        passwordHash: hashSync(data.newPassword, 10),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
