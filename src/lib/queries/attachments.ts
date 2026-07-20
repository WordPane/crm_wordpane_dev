import { desc, eq } from "drizzle-orm";

import {
  assertProjectAccess,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { attachments, projects, tasks, users } from "@/lib/db/schema";

export type AttachmentItem = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
  taskId: string | null;
  uploader: { id: string; name: string } | null;
};

export type TaskAttachmentItem = AttachmentItem & {
  taskTitle: string;
};

/** Anexos da tarefa — lança ForbiddenError fora do escopo. */
export async function listTaskAttachments(
  user: SessionUser,
  taskId: string,
): Promise<AttachmentItem[]> {
  requireTeam(user);

  const [task] = await db
    .select({ id: projects.id, companyId: projects.companyId })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task) return [];
  await assertProjectAccess(user, task);

  return listByCondition(eq(attachments.taskId, taskId));
}

/** Anexos diretos do projeto (sem os das tarefas) — lança ForbiddenError fora do escopo. */
export async function listProjectAttachments(
  user: SessionUser,
  projectId: string,
): Promise<AttachmentItem[]> {
  requireTeam(user);

  const [project] = await db
    .select({ id: projects.id, companyId: projects.companyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return [];
  await assertProjectAccess(user, project);

  return listByCondition(eq(attachments.projectId, projectId));
}

/** Anexos das tarefas do projeto (visão consolidada, somente leitura). */
export async function listProjectTaskAttachments(
  user: SessionUser,
  projectId: string,
): Promise<TaskAttachmentItem[]> {
  requireTeam(user);

  const [project] = await db
    .select({ id: projects.id, companyId: projects.companyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return [];
  await assertProjectAccess(user, project);

  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      createdAt: attachments.createdAt,
      taskId: attachments.taskId,
      taskTitle: tasks.title,
      uploaderId: users.id,
      uploaderName: users.name,
    })
    .from(attachments)
    .innerJoin(tasks, eq(attachments.taskId, tasks.id))
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(attachments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    createdAt: r.createdAt,
    taskId: r.taskId,
    taskTitle: r.taskTitle,
    uploader: r.uploaderId ? { id: r.uploaderId, name: r.uploaderName! } : null,
  }));
}

async function listByCondition(
  condition: ReturnType<typeof eq>,
): Promise<AttachmentItem[]> {
  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      createdAt: attachments.createdAt,
      taskId: attachments.taskId,
      uploaderId: users.id,
      uploaderName: users.name,
    })
    .from(attachments)
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(condition)
    .orderBy(desc(attachments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    createdAt: r.createdAt,
    taskId: r.taskId,
    uploader: r.uploaderId ? { id: r.uploaderId, name: r.uploaderName! } : null,
  }));
}
