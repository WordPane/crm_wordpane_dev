"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin, requireUser } from "@/lib/access/permissions";
import { getBranding, updateBranding } from "@/lib/brand/settings";
import { getStorage } from "@/lib/storage";
import { brandSettingsSchema } from "@/lib/validations/settings";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Remove do storage um asset de marca substituído (ignora paths estáticos). */
async function deleteIfUpload(value: string) {
  if (value.startsWith("/")) return;
  try {
    await getStorage().delete(value);
  } catch {
    // arquivo já inexistente — ok
  }
}

/** Salva a identidade visual da instância (white-label). Só super admins. */
export async function updateBrandSettings(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = brandSettingsSchema.parse(input);

    const previous = await getBranding();
    await updateBranding(data);

    // Limpa do storage os uploads substituídos
    if (previous.logoUrl !== data.logoUrl) {
      await deleteIfUpload(previous.logoUrl);
    }
    if (previous.faviconUrl !== data.faviconUrl) {
      await deleteIfUpload(previous.faviconUrl);
    }

    // Marca afeta metadata e tema de todas as páginas
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
