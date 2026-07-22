"use server";

import { compare, hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import { portalAvatarSchema } from "@/lib/validations/portal";
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

/** Preferência: receber (ou não) popup na tela quando chega notificação nova. */
export async function updatePopupPreference(
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const user = await requireUser();

    await db
      .update(users)
      .set({ notifyPopup: enabled === true, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    revalidatePath("/admin/perfil");
    revalidatePath("/portal/perfil");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Grava a foto de perfil (arquivo já enviado via uploadFile). */
export async function updateOwnAvatar(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = portalAvatarSchema.parse(input);

    const [current] = await db
      .select({ avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    // Driver blob guarda a URL pública; driver local guarda a chave do arquivo
    const avatarUrl = data.publicUrl || data.fileKey;

    await db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Remove o arquivo anterior do storage local (melhor esforço)
    if (
      current?.avatarUrl &&
      current.avatarUrl !== avatarUrl &&
      !/^https?:\/\//i.test(current.avatarUrl)
    ) {
      await getStorage().delete(current.avatarUrl);
    }

    revalidatePath("/admin/perfil");
    revalidatePath("/portal/perfil");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
