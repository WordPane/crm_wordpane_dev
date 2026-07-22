"use server";

import { hashSync } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import { getEmailSettings } from "@/lib/email/settings";
import {
  passwordResetRequestSchema,
  passwordResetSchema,
} from "@/lib/validations/auth";
import {
  actionError,
  normalizeEmail,
  type ActionResult,
} from "@/server/actions/utils";

export type LoginState = { error?: string } | undefined;

export async function authenticate(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha inválidos." };
    }
    throw error;
  }
  redirect("/");
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

// ─────────────────────────── Recuperação de senha ───────────────────────────

/** Validade do link de redefinição enviado por e-mail. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

/** O token puro vai só no e-mail; no banco fica o hash SHA-256. */
function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Gera o link de redefinição e envia por e-mail. A resposta é sempre
 * genérica (success) para não revelar se o e-mail está cadastrado.
 */
export async function requestPasswordReset(
  input: unknown,
): Promise<ActionResult> {
  try {
    const data = passwordResetRequestSchema.parse(input);
    const email = normalizeEmail(data.email);

    const [user] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user && user.status !== "suspended") {
      const token = randomBytes(32).toString("hex");
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });

      const settings = await getEmailSettings();
      if (settings) {
        await sendEmail({
          to: email,
          subject: "Redefinição de senha",
          title: "Redefinição de senha",
          intro:
            "Recebemos um pedido para redefinir a senha da sua conta. O link expira em 1 hora. Se você não fez este pedido, ignore este e-mail — a sua senha atual continua válida.",
          cta: {
            label: "Redefinir senha",
            url: `${settings.appUrl}/redefinir-senha?token=${token}`,
          },
        });
      } else {
        console.warn(
          `Recuperação de senha para ${email} ignorada: SMTP não configurado.`,
        );
      }
    }

    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Redefine a senha a partir do token do e-mail (uso único, expira em 1h). */
export async function resetPassword(input: unknown): Promise<ActionResult> {
  try {
    const data = passwordResetSchema.parse(input);
    const tokenHash = hashResetToken(data.token);

    const [row] = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
      })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      return {
        error:
          "Link inválido ou expirado. Solicite uma nova redefinição de senha.",
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash: hashSync(data.password, 10), updatedAt: new Date() })
        .where(eq(users.id, row.userId));
      // Invalida este e qualquer outro link pendente do mesmo usuário
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordResetTokens.userId, row.userId),
            isNull(passwordResetTokens.usedAt),
          ),
        );
    });

    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
