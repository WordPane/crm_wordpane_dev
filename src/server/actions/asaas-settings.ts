"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin, requireUser } from "@/lib/access/permissions";
import { testAsaasConnection } from "@/lib/asaas/client";
import {
  getMaskedAsaasSettings,
  updateAsaasSettings as persistAsaasSettings,
} from "@/lib/asaas/settings";
import { asaasSettingsSchema } from "@/lib/validations/settings";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Salva a configuração do Asaas (API key vazia mantém a atual). Só super admins. */
export async function updateAsaasSettings(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = asaasSettingsSchema.parse(input);

    if (!data.apiKey?.trim()) {
      const current = await getMaskedAsaasSettings();
      if (!current?.hasApiKey) {
        return { error: "Informe a API key do Asaas." };
      }
    }

    await persistAsaasSettings({
      environment: data.environment,
      apiKey: data.apiKey,
    });

    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Testa a API key configurada com uma chamada barata na API do Asaas. */
export async function testAsaas(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);

    const result = await testAsaasConnection();
    if (!result.ok) return { error: result.error };

    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
