"use server";

import { compare, hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  passwordChangeSchema,
  profileNameSchema,
} from "@/lib/validations/profile";
import { actionError, type ActionResult } from "@/server/actions/utils";

/**
 * Perfil do próprio usuário — qualquer role (equipe e clientes).
 * Cada action só toca o registro do usuário autenticado.
 */
export async function updateOwnProfile(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = profileNameSchema.parse(input);

    await db
      .update(users)
      .set({ name: data.name, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    revalidatePath("/admin/perfil");
    revalidatePath("/portal/perfil");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeOwnPassword(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = passwordChangeSchema.parse(input);

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!row) return { error: "Usuário não encontrado." };

    const valid = await compare(data.currentPassword, row.passwordHash);
    if (!valid) return { error: "Senha atual incorreta." };

    await db
      .update(users)
      .set({
        passwordHash: hashSync(data.newPassword, 10),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
