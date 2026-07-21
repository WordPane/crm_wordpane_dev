"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertProjectAccess,
  requireTeam,
  requireUser,
  type SessionUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import {
  milestones,
  projects,
  taskChecklistItems,
  tasks,
  taskStatuses,
  attachments,
  demands,
} from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import { checklistItemSchema, taskFormSchema, taskUpdateSchema } from "@/lib/validations/task";
import {
  actionError,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

/** Tarefa + projeto, com acesso garantido (empresa atribuída ou membro do projeto). */
async function getScopedTask(user: SessionUser, taskId: string) {
  const [row] = await db
    .select({ task: tasks, project: projects })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) return null;
  await assertProjectAccess(user, row.project);
  return row;
}

function revalidateTask(taskId: string, projectId: string) {
  revalidatePath("/admin/tarefas");
  revalidatePath(`/admin/tarefas/${taskId}`);
  revalidatePath(`/admin/projetos/${projectId}`);
  revalidatePath("/admin/projetos");
}

export async function createTask(
  projectId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = taskFormSchema.parse(input);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };
    await assertProjectAccess(user, project);

    // Sem status informado → primeiro status ativo pela ordem
    let statusId = data.statusId || null;
    if (!statusId) {
      const [first] = await db
        .select({ id: taskStatuses.id })
        .from(taskStatuses)
        .where(eq(taskStatuses.active, true))
        .orderBy(asc(taskStatuses.position))
        .limit(1);
      statusId = first?.id ?? null;
    }

    const [created] = await db
      .insert(tasks)
      .values({
        projectId,
        milestoneId: data.milestoneId || null,
        title: data.title,
        description: nullIfEmpty(data.description),
        ownerId: data.ownerId || null,
        priority: data.priority,
        dueDate: data.dueDate || null,
        statusId,
        visibleToClient: data.visibleToClient,
        createdBy: user.id,
      })
      .returning({ id: tasks.id });

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId,
      entityType: "task",
      entityId: created.id,
      action: "task.created",
      metadata: { title: data.title },
    });

    revalidateTask(created.id, projectId);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Edição parcial da tarefa (título/descrição no dialog; responsável/visibilidade na sidebar). */
export async function updateTask(
  taskId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedTask(user, taskId);
    if (!scoped) return { error: "Tarefa não encontrada." };
    const data = taskUpdateSchema.parse(input);

    // Troca de etapa: valida que a etapa pertence ao projeto e prepara o log
    let milestoneChange: { from: string | null; to: string | null } | null =
      null;
    if (
      data.milestoneId !== undefined &&
      (data.milestoneId || null) !== scoped.task.milestoneId
    ) {
      let newName: string | null = null;
      if (data.milestoneId) {
        const [ms] = await db
          .select({ name: milestones.name, projectId: milestones.projectId })
          .from(milestones)
          .where(eq(milestones.id, data.milestoneId))
          .limit(1);
        if (!ms || ms.projectId !== scoped.project.id) {
          return { error: "Etapa não encontrada neste projeto." };
        }
        newName = ms.name;
      }
      let oldName: string | null = null;
      if (scoped.task.milestoneId) {
        const [old] = await db
          .select({ name: milestones.name })
          .from(milestones)
          .where(eq(milestones.id, scoped.task.milestoneId))
          .limit(1);
        oldName = old?.name ?? null;
      }
      milestoneChange = { from: oldName, to: newName };
    }

    await db
      .update(tasks)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined
          ? { description: nullIfEmpty(data.description) }
          : {}),
        ...(data.milestoneId !== undefined
          ? { milestoneId: data.milestoneId || null }
          : {}),
        ...(data.ownerId !== undefined
          ? { ownerId: data.ownerId || null }
          : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.dueDate !== undefined
          ? { dueDate: data.dueDate || null }
          : {}),
        ...(data.visibleToClient !== undefined
          ? { visibleToClient: data.visibleToClient }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    if (milestoneChange) {
      await logActivity({
        actorId: user.id,
        companyId: scoped.project.companyId,
        projectId: scoped.project.id,
        entityType: "task",
        entityId: taskId,
        action: "task.milestone_changed",
        metadata: {
          title: scoped.task.title,
          from: milestoneChange.from,
          to: milestoneChange.to,
        },
      });
    }

    revalidateTask(taskId, scoped.project.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateTaskStatus(
  taskId: string,
  statusId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedTask(user, taskId);
    if (!scoped) return { error: "Tarefa não encontrada." };
    const { task, project } = scoped;

    const [status] = await db
      .select()
      .from(taskStatuses)
      .where(eq(taskStatuses.id, statusId))
      .limit(1);
    if (!status) return { error: "Status não encontrado." };
    if (task.statusId === statusId) return { success: true };

    const [oldStatus] = task.statusId
      ? await db
          .select({ name: taskStatuses.name })
          .from(taskStatuses)
          .where(eq(taskStatuses.id, task.statusId))
          .limit(1)
      : [];

    await db
      .update(tasks)
      .set({
        statusId,
        completedAt: status.isFinal ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId: project.id,
      entityType: "task",
      entityId: taskId,
      action: "task.status_changed",
      metadata: {
        title: task.title,
        from: oldStatus?.name ?? null,
        to: status.name,
      },
    });

    if (status.isFinal) {
      await logActivity({
        actorId: user.id,
        companyId: project.companyId,
        projectId: project.id,
        entityType: "task",
        entityId: taskId,
        action: "task.completed",
        metadata: { title: task.title },
      });
    }

    revalidateTask(taskId, project.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Checklist ───────────────────────────

export async function addChecklistItem(
  taskId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedTask(user, taskId);
    if (!scoped) return { error: "Tarefa não encontrada." };
    const { label } = checklistItemSchema.parse(input);

    const [max] = await db
      .select({
        value: sql<number>`coalesce(max(${taskChecklistItems.position}), -1)`,
      })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId));

    await db.insert(taskChecklistItems).values({
      taskId,
      label,
      position: max.value + 1,
    });

    revalidatePath(`/admin/tarefas/${taskId}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function toggleChecklistItem(itemId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [item] = await db
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.id, itemId))
      .limit(1);
    if (!item) return { error: "Item não encontrado." };
    const scoped = await getScopedTask(user, item.taskId);
    if (!scoped) return { error: "Tarefa não encontrada." };

    await db
      .update(taskChecklistItems)
      .set({ done: !item.done })
      .where(eq(taskChecklistItems.id, itemId));

    revalidatePath(`/admin/tarefas/${item.taskId}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteChecklistItem(itemId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [item] = await db
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.id, itemId))
      .limit(1);
    if (!item) return { error: "Item não encontrado." };
    const scoped = await getScopedTask(user, item.taskId);
    if (!scoped) return { error: "Tarefa não encontrada." };

    await db
      .delete(taskChecklistItems)
      .where(eq(taskChecklistItems.id, itemId));

    revalidatePath(`/admin/tarefas/${item.taskId}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Exclui a tarefa: checklist, comentários e anexos (registro) vão em cascade;
 * demandas vinculadas são desvinculadas; arquivos dos anexos saem do storage
 * (melhor esforço). A equipe com acesso ao projeto pode excluir.
 */
export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const scoped = await getScopedTask(user, taskId);
    if (!scoped) return { error: "Tarefa não encontrada." };
    const { task, project } = scoped;

    // Chaves dos anexos para limpar o storage depois da exclusão
    const attachmentRows = await db
      .select({ fileKey: attachments.fileKey })
      .from(attachments)
      .where(eq(attachments.taskId, taskId));

    await db.transaction(async (tx) => {
      // Demandas convertidas nesta tarefa ficam sem vínculo (coluna sem FK)
      await tx
        .update(demands)
        .set({ taskId: null })
        .where(eq(demands.taskId, taskId));
      await tx.delete(tasks).where(eq(tasks.id, taskId));
    });

    // Arquivos locais dos anexos (blob guarda URL pública — nada a remover)
    for (const row of attachmentRows) {
      if (!/^https?:\/\//i.test(row.fileKey)) {
        await getStorage().delete(row.fileKey);
      }
    }

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId: project.id,
      entityType: "task",
      entityId: taskId,
      action: "task.deleted",
      metadata: { title: task.title },
    });

    revalidateTask(taskId, project.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
