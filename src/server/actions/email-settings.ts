"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin, requireUser } from "@/lib/access/permissions";
import { sendEmail } from "@/lib/email/mailer";
import {
  getMaskedEmailSettings,
  updateEmailSettings as persistEmailSettings,
} from "@/lib/email/settings";
import { emailSettingsSchema } from "@/lib/validations/settings";
import { actionError, type ActionResult } from "@/server/actions/utils";

/** Salva a configuração SMTP (senha vazia mantém a atual). Só super admins. */
export async function updateEmailSettings(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = emailSettingsSchema.parse(input);

    if (!data.password?.trim()) {
      const current = await getMaskedEmailSettings();
      if (!current?.hasPassword) {
        return { error: "Informe a senha do SMTP." };
      }
    }

    await persistEmailSettings(data);

    revalidatePath("/admin/configuracoes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Envia um e-mail de teste para o próprio super admin logado. */
export async function sendTestEmail(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);

    const result = await sendEmail({
      to: user.email,
      subject: "Teste de configuração SMTP",
      title: "Teste de configuração SMTP",
      intro: "Se você recebeu este e-mail, a integração está funcionando.",
    });
    if (!result.ok) return { error: result.error };

    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
