"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";
import { actionError, type ActionResult } from "@/server/actions/utils";

const saveViewSchema = z.object({
  name: z.string().min(1).max(120),
  entity: z.string().min(1).max(40),
  filters: z.record(
    z.string(),
    z.union([z.string(), z.boolean(), z.undefined()]),
  ),
});

const deleteViewSchema = z.object({
  id: z.string().uuid(),
  entity: z.string().min(1),
});

/** Salva uma nova visualização de filtros para o usuário logado. */
export async function saveView(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = saveViewSchema.parse(input);

    const trimmedName = data.name.trim();
    if (!trimmedName) return { error: "Informe um nome para a visualização." };

    await db.insert(savedViews).values({
      userId: user.id,
      name: trimmedName,
      entity: data.entity,
      filters: data.filters,
    });

    revalidatePath(`/admin/${data.entity}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Exclui uma visualização salva do usuário logado. */
export async function deleteView(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const { id, entity } = deleteViewSchema.parse(input);

    await db
      .delete(savedViews)
      .where(
        and(eq(savedViews.id, id), eq(savedViews.userId, user.id)),
      );

    revalidatePath(`/admin/${entity}`);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
