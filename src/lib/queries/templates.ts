import { asc, eq } from "drizzle-orm";

import {
  requireSuperAdmin,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  projectTemplateMilestones,
  projectTemplateTasks,
  projectTemplates,
  type ProjectTemplateTask,
} from "@/lib/db/schema";

export type TemplateTaskItem = {
  id: string;
  title: string;
  description: string | null;
  priority: ProjectTemplateTask["priority"];
  visibleToClient: boolean;
};

export type TemplateMilestoneItem = {
  id: string;
  name: string;
  description: string | null;
  tasks: TemplateTaskItem[];
};

export type ProjectTemplateItem = {
  id: string;
  name: string;
  description: string | null;
  milestones: TemplateMilestoneItem[];
};

/** Modelos ativos com a árvore completa (editor nas configurações). */
export async function listProjectTemplates(
  user: SessionUser,
): Promise<ProjectTemplateItem[]> {
  requireSuperAdmin(user);

  const templates = await db
    .select()
    .from(projectTemplates)
    .where(eq(projectTemplates.active, true))
    .orderBy(asc(projectTemplates.name));
  if (templates.length === 0) return [];

  const milestoneRows = await db
    .select()
    .from(projectTemplateMilestones)
    .orderBy(asc(projectTemplateMilestones.position));
  const taskRows = await db
    .select()
    .from(projectTemplateTasks)
    .orderBy(asc(projectTemplateTasks.position));

  const tasksByMilestone = new Map<string, TemplateTaskItem[]>();
  for (const t of taskRows) {
    const list = tasksByMilestone.get(t.milestoneId) ?? [];
    list.push({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      visibleToClient: t.visibleToClient,
    });
    tasksByMilestone.set(t.milestoneId, list);
  }

  const milestonesByTemplate = new Map<string, TemplateMilestoneItem[]>();
  for (const m of milestoneRows) {
    const list = milestonesByTemplate.get(m.templateId) ?? [];
    list.push({
      id: m.id,
      name: m.name,
      description: m.description,
      tasks: tasksByMilestone.get(m.id) ?? [],
    });
    milestonesByTemplate.set(m.templateId, list);
  }

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    milestones: milestonesByTemplate.get(t.id) ?? [],
  }));
}

/** id + nome dos modelos ativos (selects de aplicação). */
export async function listProjectTemplateOptions(
  user: SessionUser,
): Promise<{ id: string; name: string }[]> {
  requireTeam(user);
  return db
    .select({ id: projectTemplates.id, name: projectTemplates.name })
    .from(projectTemplates)
    .where(eq(projectTemplates.active, true))
    .orderBy(asc(projectTemplates.name));
}
