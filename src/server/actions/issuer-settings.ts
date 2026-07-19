"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin, requireUser } from "@/lib/access/permissions";
import { updateIssuer } from "@/lib/issuer";
import { issuerSettingsSchema } from "@/lib/validations/settings";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Salva os dados do emissor (exibidos no PDF do orçamento). Só super admins. */
export async function updateIssuerSettings(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = issuerSettingsSchema.parse(input);

    await updateIssuer(data);

    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
