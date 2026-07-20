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

export type RecentUnreadNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
};

/** Não lidas mais recentes — polling do popup e semente de ids do sino. */
export async function listRecentUnread(
  user: SessionUser,
  limit = 5,
): Promise<RecentUnreadNotification[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
