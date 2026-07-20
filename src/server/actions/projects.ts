"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertCompanyAccess,
  assertProjectAccess,
  requireSuperAdmin,
  requireTeam,
  requireUser,
  type SessionUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import {
  milestones,
  projectMembers,
  projects,
  projectStatuses,
  users,
  type Milestone,
} from "@/lib/db/schema";
import {
  milestoneFormSchema,
  projectFormSchema,
} from "@/lib/validations/project";
import {
  actionError,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

/** Projeto existente + acesso garantido (empresa atribuída ou membro do projeto). */
async function getScopedProject(user: SessionUser, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
  await assertProjectAccess(user, project);
  return project;
}

function revalidateProject(projectId: string, companyId?: string) {
  revalidatePath("/admin/projetos");
  revalidatePath(`/admin/projetos/${projectId}`);
  if (companyId) revalidatePath(`/admin/clientes/${companyId}`);
}

// ─────────────────────────── Projeto ───────────────────────────

export async function createProject(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = projectFormSchema.parse(input);
    await assertCompanyAccess(user, data.companyId);

    // Sem status informado → primeiro status ativo pela ordem
    let statusId = data.statusId || null;
    if (!statusId) {
      const [first] = await db
        .select({ id: projectStatuses.id })
        .from(projectStatuses)
        .where(eq(projectStatuses.active, true))
        .orderBy(asc(projectStatuses.position))
        .limit(1);
      statusId = first?.id ?? null;
    }

    const [created] = await db
      .insert(projects)
      .values({
        name: data.name,
        companyId: data.companyId,
        type: data.type,
        statusId,
        ownerId: data.ownerId || null,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        priority: data.priority,
        description: nullIfEmpty(data.description),
        createdBy: user.id,
      })
      .returning({ id: projects.id });

    await logActivity({
      actorId: user.id,
      companyId: data.companyId,
      projectId: created.id,
      entityType: "project",
      entityId: created.id,
      action: "project.created",
      metadata: { title: data.name },
    });

    revalidateProject(created.id, data.companyId);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProject(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const project = await getScopedProject(user, id);
    if (!project) return { error: "Projeto não encontrado." };
    const data = projectFormSchema.parse(input);
    await assertCompanyAccess(user, data.companyId);

    await db
      .update(projects)
      .set({
        name: data.name,
        companyId: data.companyId,
        type: data.type,
        statusId: data.statusId || null,
        ownerId: data.ownerId || null,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        priority: data.priority,
        description: nullIfEmpty(data.description),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    await logActivity({
      actorId: user.id,
      companyId: data.companyId,
      projectId: id,
      entityType: "project",
      entityId: id,
      action: "project.updated",
      metadata: { title: data.name },
    });

    revalidateProject(id, data.companyId);
    if (data.companyId !== project.companyId) {
      revalidatePath(`/admin/clientes/${project.companyId}`);
    }
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProjectStatus(
  id: string,
  statusId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const project = await getScopedProject(user, id);
    if (!project) return { error: "Projeto não encontrado." };

    const [status] = await db
      .select()
      .from(projectStatuses)
      .where(eq(projectStatuses.id, statusId))
      .limit(1);
    if (!status) return { error: "Status não encontrado." };
    if (project.statusId === statusId) return { success: true };

    const [oldStatus] = project.statusId
      ? await db
          .select({ name: projectStatuses.name })
          .from(projectStatuses)
          .where(eq(projectStatuses.id, project.statusId))
          .limit(1)
      : [];

    await db
      .update(projects)
      .set({
        statusId,
        completedAt: status.isFinal ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId: id,
      entityType: "project",
      entityId: id,
      action: "project.status_changed",
      metadata: {
        title: project.name,
        from: oldStatus?.name ?? null,
        to: status.name,
      },
    });

    revalidateProject(id, project.companyId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) return { error: "Projeto não encontrado." };

    await db.delete(projects).where(eq(projects.id, id));

    // Sem projectId: a atividade ligada ao projeto é removida em cascade
    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      entityType: "project",
      entityId: id,
      action: "project.deleted",
      metadata: { title: project.name },
    });

    revalidatePath("/admin/projetos");
    revalidatePath(`/admin/clientes/${project.companyId}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Equipe do projeto ───────────────────────────

export async function addProjectMember(
  projectId: string,
  userId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const project = await getScopedProject(user, projectId);
    if (!project) return { error: "Projeto não encontrado." };

    const [member] = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!member || (member.role !== "admin" && member.role !== "super_admin")) {
      return { error: "Membro da equipe não encontrado." };
    }

    await db.insert(projectMembers).values({ projectId, userId });

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId,
      entityType: "member",
      entityId: userId,
      action: "member.added",
      metadata: { name: member.name, project: project.name },
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Este usuário já é membro do projeto.",
    });
  }
}

export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const project = await getScopedProject(user, projectId);
    if (!project) return { error: "Projeto não encontrado." };

    const [member] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      );

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId,
      entityType: "member",
      entityId: userId,
      action: "member.removed",
      metadata: { name: member?.name ?? null, project: project.name },
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

// ─────────────────────────── Etapas ───────────────────────────

async function getScopedMilestone(user: SessionUser, milestoneId: string) {
  const [milestone] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);
  if (!milestone) return null;
  const project = await getScopedProject(user, milestone.projectId);
  if (!project) return null;
  return { milestone, project };
}

export async function createMilestone(
  projectId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const project = await getScopedProject(user, projectId);
    if (!project) return { error: "Projeto não encontrado." };
    const data = milestoneFormSchema.parse(input);

    const [max] = await db
      .select({
        value: sql<number>`coalesce(max(${milestones.position}), -1)`,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId));

    const [created] = await db
      .insert(milestones)
      .values({
        projectId,
        name: data.name,
        description: nullIfEmpty(data.description),
        dueDate: data.dueDate || null,
        ownerId: data.ownerId || null,
        position: max.value + 1,
      })
      .returning({ id: milestones.id });

    await logActivity({
      actorId: user.id,
      companyId: project.companyId,
      projectId,
      entityType: "milestone",
      entityId: created.id,
      action: "milestone.created",
      metadata: { title: data.name },
    });

    revalidateProject(projectId);
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateMilestone(
  milestoneId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedMilestone(user, milestoneId);
    if (!scoped) return { error: "Etapa não encontrada." };
    const data = milestoneFormSchema.parse(input);

    await db
      .update(milestones)
      .set({
        name: data.name,
        description: nullIfEmpty(data.description),
        dueDate: data.dueDate || null,
        ownerId: data.ownerId || null,
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, milestoneId));

    revalidateProject(scoped.project.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateMilestoneStatus(
  milestoneId: string,
  status: Milestone["status"],
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedMilestone(user, milestoneId);
    if (!scoped) return { error: "Etapa não encontrada." };
    const { milestone, project } = scoped;
    if (milestone.status === status) return { success: true };

    const completing = status === "concluida";
    await db
      .update(milestones)
      .set({
        status,
        completedAt: completing ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, milestoneId));

    if (completing || milestone.status === "concluida") {
      await logActivity({
        actorId: user.id,
        companyId: project.companyId,
        projectId: project.id,
        entityType: "milestone",
        entityId: milestoneId,
        action: completing ? "milestone.completed" : "milestone.reopened",
        metadata: { title: milestone.name },
      });
    }

    revalidateProject(project.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteMilestone(
  milestoneId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedMilestone(user, milestoneId);
    if (!scoped) return { error: "Etapa não encontrada." };

    await db.delete(milestones).where(eq(milestones.id, milestoneId));

    revalidateProject(scoped.project.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function moveMilestone(
  milestoneId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const scoped = await getScopedMilestone(user, milestoneId);
    if (!scoped) return { error: "Etapa não encontrada." };
    const { milestone, project } = scoped;

    const siblings = await db
      .select({ id: milestones.id, position: milestones.position })
      .from(milestones)
      .where(eq(milestones.projectId, project.id))
      .orderBy(asc(milestones.position), asc(milestones.createdAt));

    const index = siblings.findIndex((s) => s.id === milestone.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      return { success: true };
    }

    const current = siblings[index];
    const target = siblings[targetIndex];
    await db.transaction(async (tx) => {
      await tx
        .update(milestones)
        .set({ position: target.position })
        .where(eq(milestones.id, current.id));
      await tx
        .update(milestones)
        .set({ position: current.position })
        .where(eq(milestones.id, target.id));
    });

    revalidateProject(project.id);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
