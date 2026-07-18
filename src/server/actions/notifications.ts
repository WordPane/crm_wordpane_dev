"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Marca uma notificação como lida — apenas a do próprio usuário. */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.id, id), eq(notifications.userId, user.id)),
      );
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Marca todas as notificações do usuário como lidas. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, user.id), isNull(notifications.readAt)),
      );
    revalidatePath("/admin/notificacoes");
    revalidatePath("/portal/notificacoes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
