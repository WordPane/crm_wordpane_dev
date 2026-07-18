import { and, eq, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  adminCompanyAssignments,
  notifications,
  users,
} from "@/lib/db/schema";

export type NotificationInput = {
  /** comment | demand.created | demand.status | upload */
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

/** Insere notificações em lote (deduplica destinatários, ignora lista vazia). */
export async function notifyUsers(
  userIds: string[],
  n: NotificationInput,
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  await db.insert(notifications).values(
    ids.map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
    })),
  );
}

/** Super admins + admins ativos atribuídos à empresa. */
export async function teamUsersOfCompany(companyId: string): Promise<string[]> {
  const assigned = await db
    .select({ adminId: adminCompanyAssignments.adminId })
    .from(adminCompanyAssignments)
    .where(eq(adminCompanyAssignments.companyId, companyId));
  const assignedIds = assigned.map((r) => r.adminId);

  const roleConditions: SQL[] = [eq(users.role, "super_admin")];
  if (assignedIds.length > 0) {
    roleConditions.push(
      and(eq(users.role, "admin"), inArray(users.id, assignedIds))!,
    );
  }

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, "active"), or(...roleConditions)));
  return rows.map((r) => r.id);
}

/** Usuários client ativos da empresa. */
export async function clientUsersOfCompany(
  companyId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "client"),
        eq(users.companyId, companyId),
        eq(users.status, "active"),
      ),
    );
  return rows.map((r) => r.id);
}
