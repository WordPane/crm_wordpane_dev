import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { SessionUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { notifications, type Notification } from "@/lib/db/schema";

/** Últimas notificações do usuário, mais recentes primeiro. */
export async function listNotifications(
  user: SessionUser,
  limit = 50,
): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Quantidade de notificações não lidas (badge do sino). */
export async function countUnread(user: SessionUser): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  return row?.value ?? 0;
}
