import { asc, sql } from "drizzle-orm";

import { requireSuperAdmin, type SessionUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { projects, projectStatuses, tasks, taskStatuses } from "@/lib/db/schema";

export type StatusWithUsage = {
  id: string;
  name: string;
  color: string;
  position: number;
  isFinal: boolean;
  active: boolean;
  usageCount: number;
};

/** Todos os status de projeto + nº de projetos que os usam (somente super_admin). */
export async function listProjectStatusesWithUsage(
  user: SessionUser,
): Promise<StatusWithUsage[]> {
  requireSuperAdmin(user);

  const [rows, usage] = await Promise.all([
    db
      .select()
      .from(projectStatuses)
      .orderBy(asc(projectStatuses.position), asc(projectStatuses.name)),
    db
      .select({
        statusId: projects.statusId,
        count: sql<number>`count(*)::int`,
      })
      .from(projects)
      .groupBy(projects.statusId),
  ]);

  const counts = new Map(usage.map((u) => [u.statusId, u.count]));
  return rows.map((r) => ({ ...r, usageCount: counts.get(r.id) ?? 0 }));
}

/** Todos os status de tarefa + nº de tarefas que os usam (somente super_admin). */
export async function listTaskStatusesWithUsage(
  user: SessionUser,
): Promise<StatusWithUsage[]> {
  requireSuperAdmin(user);

  const [rows, usage] = await Promise.all([
    db
      .select()
      .from(taskStatuses)
      .orderBy(asc(taskStatuses.position), asc(taskStatuses.name)),
    db
      .select({
        statusId: tasks.statusId,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .groupBy(tasks.statusId),
  ]);

  const counts = new Map(usage.map((u) => [u.statusId, u.count]));
  return rows.map((r) => ({ ...r, usageCount: counts.get(r.id) ?? 0 }));
}
