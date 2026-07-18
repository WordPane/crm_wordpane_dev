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
import {
  attachments,
  demands,
  projects,
  tasks,
  type Attachment,
} from "@/lib/db/schema";
import { clientUsersOfCompany, notifyUsers } from "@/lib/notifications";
import { getStorage } from "@/lib/storage";
import { attachmentFormSchema } from "@/lib/validations/attachment";
import { actionError, type ActionResult } from "@/server/actions/utils";

type AttachmentTarget = {
  companyId: string;
  projectId: string | null;
  /** Contexto para o texto da atividade (título da tarefa ou nome do projeto). */
  targetName: string;
  /** URL do portal quando o anexo é visível ao cliente (projeto/tarefa visível). */
  clientHref: string | null;
};

/** Resolve a empresa dona do anexo (via tarefa→projeto, projeto ou demanda). */
async function resolveAttachmentOwner(
  attachment: Attachment,
): Promise<{ companyId: string; projectId: string | null } | null> {
  if (attachment.taskId) {
    const [row] = await db
      .select({ companyId: projects.companyId, projectId: projects.id })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, attachment.taskId))
      .limit(1);
    return row ?? null;
  }
  if (attachment.projectId) {
    const [row] = await db
      .select({ companyId: projects.companyId, projectId: projects.id })
      .from(projects)
      .where(eq(projects.id, attachment.projectId))
      .limit(1);
    return row ?? null;
  }
  if (attachment.demandId) {
    const [row] = await db
      .select({ companyId: demands.companyId })
      .from(demands)
      .where(eq(demands.id, attachment.demandId))
      .limit(1);
    return row ? { companyId: row.companyId, projectId: null } : null;
  }
  return null;
}

/** Resolve o alvo de um novo anexo validando o acesso à empresa. */
async function resolveTarget(
  user: SessionUser,
  data: { taskId?: string; projectId?: string; demandId?: string },
): Promise<AttachmentTarget | null> {
  if (data.taskId) {
    const [row] = await db
      .select({
        companyId: projects.companyId,
        projectId: projects.id,
        taskTitle: tasks.title,
        visibleToClient: tasks.visibleToClient,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, data.taskId))
      .limit(1);
    if (!row) return null;
    await assertCompanyAccess(user, row.companyId);
    return {
      companyId: row.companyId,
      projectId: row.projectId,
      targetName: row.taskTitle,
      clientHref: row.visibleToClient
        ? `/portal/projetos/${row.projectId}/tarefas/${data.taskId}`
        : null,
    };
  }
  if (data.projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);
    if (!project) return null;
    await assertCompanyAccess(user, project.companyId);
    return {
      companyId: project.companyId,
      projectId: project.id,
      targetName: project.name,
      clientHref: `/portal/projetos/${project.id}`,
    };
  }
  if (data.demandId) {
    const [demand] = await db
      .select()
      .from(demands)
      .where(eq(demands.id, data.demandId))
      .limit(1);
    if (!demand) return null;
    await assertCompanyAccess(user, demand.companyId);
    return {
      companyId: demand.companyId,
      projectId: null,
      targetName: demand.title,
      clientHref: null,
    };
  }
  return null;
}

function revalidateAttachment(target: AttachmentTarget, taskId?: string) {
  if (taskId) revalidatePath(`/admin/tarefas/${taskId}`);
  if (target.projectId) revalidatePath(`/admin/projetos/${target.projectId}`);
  revalidatePath("/admin/demandas");
  revalidatePath(`/admin/clientes/${target.companyId}`);
}

export async function createAttachment(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = attachmentFormSchema.parse(input);

    const target = await resolveTarget(user, {
      taskId: data.taskId || undefined,
      projectId: data.projectId || undefined,
      demandId: data.demandId || undefined,
    });
    if (!target) return { error: "Destino do anexo não encontrado." };

    const [created] = await db
      .insert(attachments)
      .values({
        taskId: data.taskId || null,
        projectId: data.projectId || null,
        demandId: data.demandId || null,
        uploadedBy: user.id,
        fileName: data.fileName,
        fileKey: data.fileKey,
        fileSize: data.fileSize,
        mimeType: data.mimeType || null,
      })
      .returning({ id: attachments.id });

    await logActivity({
      actorId: user.id,
      companyId: target.companyId,
      projectId: target.projectId,
      entityType: "attachment",
      entityId: created.id,
      action: "upload.added",
      metadata: { fileName: data.fileName, target: target.targetName },
    });

    // Upload da equipe em projeto/tarefa visível → avisa os clientes
    if (target.clientHref) {
      const recipients = await clientUsersOfCompany(target.companyId);
      await notifyUsers(
        recipients.filter((id) => id !== user.id),
        {
          type: "upload",
          title: `Novo arquivo: ${data.fileName}`,
          body: `Anexado em "${target.targetName}".`,
          href: target.clientHref,
        },
      );
    }

    revalidateAttachment(target, data.taskId || undefined);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Só quem enviou ou super_admin pode excluir. Remove registro + arquivo do storage. */
export async function deleteAttachment(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    if (!attachment) return { error: "Arquivo não encontrado." };

    const owner = await resolveAttachmentOwner(attachment);
    if (!owner) return { error: "Arquivo não encontrado." };
    await assertCompanyAccess(user, owner.companyId);

    if (attachment.uploadedBy !== user.id && user.role !== "super_admin") {
      return { error: "Você só pode excluir os arquivos que enviou." };
    }

    await db.delete(attachments).where(eq(attachments.id, id));
    await getStorage().delete(attachment.fileKey);

    revalidateAttachment(
      {
        companyId: owner.companyId,
        projectId: owner.projectId,
        targetName: "",
        clientHref: null,
      },
      attachment.taskId ?? undefined,
    );
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
