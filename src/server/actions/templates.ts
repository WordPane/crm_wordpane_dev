"use server";

import { asc, eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertProjectAccess,
  requireSuperAdmin,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import {
  milestones,
  projects,
  projectTemplateMilestones,
  projectTemplateTasks,
  projectTemplates,
  tasks,
  taskStatuses,
} from "@/lib/db/schema";
import { projectTemplateSchema } from "@/lib/validations/template";
import {
  actionError,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

/**
 * Cria (id = null) ou atualiza um modelo de projeto: o pai é atualizado e
 * a árvore é regravada na ordem do payload (apaga e reinsere os filhos).
 * Somente super admin gerencia modelos.
 */
export async function saveProjectTemplate(
  id: string | null,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = projectTemplateSchema.parse(input);

    if (id) {
      const [existing] = await db
        .select({ id: projectTemplates.id })
        .from(projectTemplates)
        .where(eq(projectTemplates.id, id))
        .limit(1);
      if (!existing) return { error: "Modelo não encontrado." };
    }

    const templateId = await db.transaction(async (tx) => {
      let templateId = id;
      if (templateId) {
        await tx
          .update(projectTemplates)
          .set({
            name: data.name,
            description: nullIfEmpty(data.description),
            updatedAt: new Date(),
          })
          .where(eq(projectTemplates.id, templateId));
        // Filhos em cascade (etapas → tarefas)
        await tx
          .delete(projectTemplateMilestones)
          .where(eq(projectTemplateMilestones.templateId, templateId));
      } else {
        const [created] = await tx
          .insert(projectTemplates)
          .values({
            name: data.name,
            description: nullIfEmpty(data.description),
          })
          .returning({ id: projectTemplates.id });
        templateId = created.id;
      }

      for (const [mi, m] of data.milestones.entries()) {
        const [milestone] = await tx
          .insert(projectTemplateMilestones)
          .values({
            templateId,
            name: m.name,
            description: nullIfEmpty(m.description),
            position: mi,
          })
          .returning({ id: projectTemplateMilestones.id });
        if (m.tasks.length > 0) {
          await tx.insert(projectTemplateTasks).values(
            m.tasks.map((t, ti) => ({
              milestoneId: milestone.id,
              title: t.title,
              description: nullIfEmpty(t.description),
              priority: t.priority,
              visibleToClient: t.visibleToClient,
              position: ti,
            })),
          );
        }
      }
      return templateId;
    });

    revalidatePath("/admin/configuracoes");
    return { success: true, id: templateId };
  } catch (error) {
    return actionError(error);
  }
}

/** Exclui o modelo (etapas e tarefas dele vão em cascade). Só super admin. */
export async function deleteProjectTemplate(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);

    await db.delete(projectTemplates).where(eq(projectTemplates.id, id));

    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Aplica um modelo ao projeto: cria todas as etapas (ao final das
 * existentes) e suas tarefas (com o 1º status ativo, sem responsável/prazo).
 */
export async function applyProjectTemplate(
  projectId: string,
  templateId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };
    await assertProjectAccess(user, project);

    const [template] = await db
      .select()
      .from(projectTemplates)
      .where(eq(projectTemplates.id, templateId))
      .limit(1);
    if (!template) return { error: "Modelo não encontrado." };

    const milestoneRows = await db
      .select()
      .from(projectTemplateMilestones)
      .where(eq(projectTemplateMilestones.templateId, templateId))
      .orderBy(asc(projectTemplateMilestones.position));
    if (milestoneRows.length === 0) {
      return { error: "Este modelo não tem etapas." };
    }

    const taskRows = await db
      .select()
      .from(projectTemplateTasks)
      .where(
        inArray(
          projectTemplateTasks.milestoneId,
          milestoneRows.map((m) => m.id),
        ),
      )
      .orderBy(asc(projectTemplateTasks.position));

    const [maxRow] = await db
      .select({ value: max(milestones.position) })
      .from(milestones)
      .where(eq(milestones.projectId, projectId));
    const basePosition = (maxRow?.value ?? -1) + 1;

    // Tarefas nascem com o 1º status ativo (mesmo padrão do createTask)
    const [firstStatus] = await db
      .select({ id: taskStatuses.id })
      .from(taskStatuses)
      .where(eq(taskStatuses.active, true))
      .orderBy(asc(taskStatuses.position))
      .limit(1);

    await db.transaction(async (tx) => {
      for (const [i, tm] of milestoneRows.entries()) {
        const [milestone] = await tx
          .insert(milestones)
          .values({
            projectId,
            name: tm.name,
            description: tm.description,
            position: basePosition + i,
          })
          .returning({ id: milestones.id });

        const tmTasks = taskRows.filter((t) => t.milestoneId === tm.id);
        if (tmTasks.length > 0) {
          await tx.insert(tasks).values(
            tmTasks.map((t) => ({
              projectId,
              milestoneId: milestone.id,
              title: t.title,
              description: t.description,
              priority: t.priority,
              statusId: firstStatus?.id ?? null,
              origin: "interna" as const,
              visibleToClient: t.visibleToClient,
              createdBy: user.id,
            })),
          );
        }
      }
    });

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "project.template_applied",
      metadata: {
        name: template.name,
        milestones: milestoneRows.length,
        tasks: taskRows.length,
      },
    });

    revalidatePath(`/admin/projetos/${projectId}`);
    revalidatePath("/admin/projetos");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
