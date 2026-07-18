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
import { projectLinks, projects } from "@/lib/db/schema";
import { projectLinkFormSchema } from "@/lib/validations/link";
import {
  actionError,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

/** Projeto existente + acesso garantido à empresa dele. */
async function getScopedProject(user: SessionUser, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
  await assertCompanyAccess(user, project.companyId);
  return project;
}

export async function createProjectLink(
  projectId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const project = await getScopedProject(user, projectId);
    if (!project) return { error: "Projeto não encontrado." };
    const data = projectLinkFormSchema.parse(input);

    const [created] = await db
      .insert(projectLinks)
      .values({
        projectId,
        url: data.url,
        description: nullIfEmpty(data.description),
        version: nullIfEmpty(data.version),
        notes: nullIfEmpty(data.notes),
        createdBy: user.id,
      })
      .returning({ id: projectLinks.id });

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId,
      entityType: "link",
      entityId: created.id,
      action: "link.added",
      metadata: { url: data.url, description: nullIfEmpty(data.description) },
    });

    revalidatePath(`/admin/projetos/${projectId}`);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProjectLink(
  linkId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [link] = await db
      .select()
      .from(projectLinks)
      .where(eq(projectLinks.id, linkId))
      .limit(1);
    if (!link) return { error: "Link não encontrado." };
    const project = await getScopedProject(user, link.projectId);
    if (!project) return { error: "Projeto não encontrado." };
    const data = projectLinkFormSchema.parse(input);

    await db
      .update(projectLinks)
      .set({
        url: data.url,
        description: nullIfEmpty(data.description),
        version: nullIfEmpty(data.version),
        notes: nullIfEmpty(data.notes),
      })
      .where(eq(projectLinks.id, linkId));

    revalidatePath(`/admin/projetos/${project.id}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteProjectLink(linkId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [link] = await db
      .select()
      .from(projectLinks)
      .where(eq(projectLinks.id, linkId))
      .limit(1);
    if (!link) return { error: "Link não encontrado." };
    const project = await getScopedProject(user, link.projectId);
    if (!project) return { error: "Projeto não encontrado." };

    await db.delete(projectLinks).where(eq(projectLinks.id, linkId));

    revalidatePath(`/admin/projetos/${project.id}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
