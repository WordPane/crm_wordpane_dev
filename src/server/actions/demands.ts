"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertCompanyAccess,
  requireSuperAdmin,
  requireTeam,
  requireUser,
  type SessionUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import {
  attachments,
  demands,
  milestones,
  projects,
  taskStatuses,
  tasks,
  type Demand,
} from "@/lib/db/schema";
import {
  releaseQuotaForDemand,
  updateQuotaKindForDemand,
  usageKindForCategory,
} from "@/lib/queries/maintenance";
import { getStorage } from "@/lib/storage";
import {
  convertDemandSchema,
  demandStatusLabels,
  demandUpdateSchema,
} from "@/lib/validations/demand";
import { clientUsersOfCompany, notifyTaskAssigned, notifyUsers } from "@/lib/notifications";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Demanda existente + acesso garantido à empresa dela. */
async function getScopedDemand(user: SessionUser, demandId: string) {
  const [demand] = await db
    .select()
    .from(demands)
    .where(eq(demands.id, demandId))
    .limit(1);
  if (!demand) return null;
  await assertCompanyAccess(user, demand.companyId);
  return demand;
}

function revalidateDemand(companyId: string) {
  revalidatePath("/admin/demandas");
  revalidatePath(`/admin/clientes/${companyId}`);
}

export async function updateDemandStatus(
  demandId: string,
  status: Demand["status"],
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const demand = await getScopedDemand(user, demandId);
    if (!demand) return { error: "Demanda não encontrada." };
    if (demand.status === status) return { success: true };

    await db
      .update(demands)
      .set({ status, updatedAt: new Date() })
      .where(eq(demands.id, demandId));

    // Demanda recusada devolve a cota do plano de manutenção (idempotente)
    if (status === "recusada") await releaseQuotaForDemand(demandId);

    await logActivity({
      actorId: user.id,
      companyId: demand.companyId,
      entityType: "demand",
      entityId: demandId,
      action: "demand.status_changed",
      metadata: {
        title: demand.title,
        from: demandStatusLabels[demand.status],
        to: demandStatusLabels[status],
      },
    });

    // Mudança de status pela equipe → avisa os clientes da empresa
    const recipients = await clientUsersOfCompany(demand.companyId);
    await notifyUsers(recipients, {
      type: "demand.status",
      title: `Demanda "${demand.title}": ${demandStatusLabels[status]}`,
      body: `Status alterado de "${demandStatusLabels[demand.status]}" para "${demandStatusLabels[status]}".`,
      href: "/portal/demandas",
    });

    revalidateDemand(demand.companyId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Converte a demanda em tarefa da equipe (origin: demanda_cliente). */
export async function convertDemandToTask(
  demandId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const demand = await getScopedDemand(user, demandId);
    if (!demand) return { error: "Demanda não encontrada." };
    if (demand.taskId) {
      return { error: "Esta demanda já foi convertida em tarefa." };
    }
    const data = convertDemandSchema.parse(input);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };
    if (project.companyId !== demand.companyId) {
      return { error: "O projeto precisa ser da mesma empresa da demanda." };
    }

    if (data.milestoneId) {
      const [milestone] = await db
        .select({ id: milestones.id, projectId: milestones.projectId })
        .from(milestones)
        .where(eq(milestones.id, data.milestoneId))
        .limit(1);
      if (!milestone) return { error: "Etapa não encontrada." };
      if (milestone.projectId !== project.id) {
        return { error: "A etapa não pertence ao projeto selecionado." };
      }
    }

    // Primeiro status ativo pela ordem (mesma regra de createTask)
    const [firstStatus] = await db
      .select({ id: taskStatuses.id })
      .from(taskStatuses)
      .where(eq(taskStatuses.active, true))
      .orderBy(asc(taskStatuses.position))
      .limit(1);

    const [created] = await db
      .insert(tasks)
      .values({
        projectId: project.id,
        milestoneId: data.milestoneId || null,
        title: demand.title,
        description: demand.description,
        ownerId: data.ownerId || null,
        priority: demand.priority,
        statusId: firstStatus?.id ?? null,
        origin: "demanda_cliente",
        createdBy: user.id,
      })
      .returning({ id: tasks.id });

    // A demanda deixa de existir: anexos migram para a tarefa e o
    // acompanhamento passa a ser só pela tarefa (admin e portal)
    await db
      .update(attachments)
      .set({ taskId: created.id, demandId: null })
      .where(eq(attachments.demandId, demandId));
    await db.delete(demands).where(eq(demands.id, demandId));

    await logActivity({
      actorId: user.id,
      companyId: demand.companyId,
      projectId: project.id,
      entityType: "demand",
      entityId: demandId,
      action: "demand.converted",
      metadata: { title: demand.title, project: project.name },
    });

    // A demanda some do portal — o cliente acompanha pela tarefa gerada
    const recipients = await clientUsersOfCompany(demand.companyId);
    await notifyUsers(recipients, {
      type: "demand.converted",
      title: `Demanda virou tarefa: "${demand.title}"`,
      body: `A equipe converteu sua demanda em uma tarefa do projeto "${project.name}".`,
      href: `/portal/projetos/${project.id}/tarefas/${created.id}`,
    });

    await notifyTaskAssigned({
      actorId: user.id,
      actorName: user.name,
      ownerId: data.ownerId || null,
      taskId: created.id,
      taskTitle: demand.title,
      projectName: project.name,
    });

    revalidateDemand(demand.companyId);
    revalidatePath("/admin/tarefas");
    revalidatePath(`/admin/tarefas/${created.id}`);
    revalidatePath(`/admin/projetos/${project.id}`);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Edição da demanda (somente super_admin): título, descrição, categoria, prioridade e projeto. */
export async function updateDemand(
  demandId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = demandUpdateSchema.parse(input);

    const [demand] = await db
      .select()
      .from(demands)
      .where(eq(demands.id, demandId))
      .limit(1);
    if (!demand) return { error: "Demanda não encontrada." };

    const projectId = data.projectId || null;
    if (projectId) {
      const [project] = await db
        .select({ companyId: projects.companyId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) return { error: "Projeto não encontrado." };
      if (project.companyId !== demand.companyId) {
        return { error: "O projeto precisa ser da mesma empresa da demanda." };
      }
    }

    await db
      .update(demands)
      .set({
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        projectId,
        updatedAt: new Date(),
      })
      .where(eq(demands.id, demandId));

    // Cota do plano: mudou de projeto → estorna (a cota era do projeto
    // original); só mudou a categoria → ajusta o tipo do consumo
    if (projectId !== demand.projectId) {
      await releaseQuotaForDemand(demandId);
    } else if (data.category !== demand.category) {
      await updateQuotaKindForDemand(
        demandId,
        usageKindForCategory(data.category),
      );
    }

    await logActivity({
      actorId: user.id,
      companyId: demand.companyId,
      entityType: "demand",
      entityId: demandId,
      action: "demand.updated",
      metadata: { title: data.title },
    });

    revalidateDemand(demand.companyId);
    revalidatePath("/portal/demandas");
    return { success: true, id: demandId };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Exclusão da demanda (somente super_admin), junto com os anexos.
 * Se a demanda já foi convertida, a tarefa vinculada é mantida.
 */
export async function deleteDemand(demandId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);

    const [demand] = await db
      .select()
      .from(demands)
      .where(eq(demands.id, demandId))
      .limit(1);
    if (!demand) return { error: "Demanda não encontrada." };

    // Anexos: remove os arquivos do storage (best-effort) e os registros
    const demandAttachments = await db
      .select()
      .from(attachments)
      .where(eq(attachments.demandId, demandId));
    await db.delete(attachments).where(eq(attachments.demandId, demandId));
    const storage = getStorage();
    await Promise.allSettled(
      demandAttachments.map((a) => storage.delete(a.fileKey)),
    );

    await db.delete(demands).where(eq(demands.id, demandId));

    // Exclusão devolve a cota do plano de manutenção (idempotente)
    await releaseQuotaForDemand(demandId);

    await logActivity({
      actorId: user.id,
      companyId: demand.companyId,
      entityType: "demand",
      entityId: demandId,
      action: "demand.deleted",
      metadata: { title: demand.title },
    });

    revalidateDemand(demand.companyId);
    revalidatePath("/portal/demandas");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
