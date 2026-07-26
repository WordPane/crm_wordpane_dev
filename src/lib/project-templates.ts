import { addDays, format, parseISO } from "date-fns";
import { asc, eq, inArray, max } from "drizzle-orm";

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
import { businessToday } from "@/lib/utils/format";

/**
 * Núcleo de `applyProjectTemplate` SEM auth: copia as etapas do modelo para
 * o projeto (ao final das existentes) e suas tarefas (1º status ativo, sem
 * responsável, origem "interna"). O prazo relativo do modelo (`dueInDays`,
 * em dias corridos) vira `dueDate` real contada a partir do `startDate` do
 * projeto — ou de hoje, quando o projeto não tem data de início.
 * `createdBy` é o autor registrado nas tarefas e no log — null quando a
 * materialização partiu do sistema (automação de orçamento aprovado via
 * link público).
 */
export async function materializeProjectTemplate(
  projectId: string,
  templateId: string,
  createdBy: string | null,
): Promise<
  { ok: true; milestones: number; tasks: number } | { ok: false; error: string }
> {
  const [project] = await db
    .select({
      id: projects.id,
      companyId: projects.companyId,
      startDate: projects.startDate,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { ok: false, error: "Projeto não encontrado." };

  const [template] = await db
    .select()
    .from(projectTemplates)
    .where(eq(projectTemplates.id, templateId))
    .limit(1);
  if (!template) return { ok: false, error: "Modelo não encontrado." };

  const milestoneRows = await db
    .select()
    .from(projectTemplateMilestones)
    .where(eq(projectTemplateMilestones.templateId, templateId))
    .orderBy(asc(projectTemplateMilestones.position));
  if (milestoneRows.length === 0) {
    return { ok: false, error: "Este modelo não tem etapas." };
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

  // Prazo relativo (dias corridos) vira data real a partir do início do
  // projeto — ou de hoje, quando o projeto não tem data de início
  const base = project.startDate ?? businessToday();
  const toDueDate = (days: number | null): string | null =>
    days == null ? null : format(addDays(parseISO(base), days), "yyyy-MM-dd");

  await db.transaction(async (tx) => {
    for (const [i, tm] of milestoneRows.entries()) {
      const [milestone] = await tx
        .insert(milestones)
        .values({
          projectId,
          name: tm.name,
          description: tm.description,
          dueDate: toDueDate(tm.dueInDays),
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
            dueDate: toDueDate(t.dueInDays),
            statusId: firstStatus?.id ?? null,
            origin: "interna" as const,
            visibleToClient: t.visibleToClient,
            createdBy,
          })),
        );
      }
    }
  });

  await logActivity({
    actorId: createdBy,
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

  return { ok: true, milestones: milestoneRows.length, tasks: taskRows.length };
}
