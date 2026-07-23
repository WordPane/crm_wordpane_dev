"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertProjectAccess,
  requireSuperAdmin,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  projects,
  projectTemplateMilestones,
  projectTemplateTasks,
  projectTemplates,
} from "@/lib/db/schema";
import { materializeProjectTemplate } from "@/lib/project-templates";
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

    const result = await materializeProjectTemplate(
      projectId,
      templateId,
      user.id,
    );
    if (!result.ok) return { error: result.error };

    revalidatePath(`/admin/projetos/${projectId}`);
    revalidatePath("/admin/projetos");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
