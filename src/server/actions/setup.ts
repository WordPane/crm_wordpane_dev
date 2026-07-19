"use server";

import { hashSync } from "bcryptjs";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hasSuperAdmin, invalidateSetupCache } from "@/lib/setup";
import { bootstrapAdminSchema } from "@/lib/validations/user";
import {
  actionError,
  normalizeEmail,
  type ActionResult,
} from "@/server/actions/utils";

/**
 * Cria o primeiro super admin da instância (wizard /setup).
 * Ação pública, mas só funciona enquanto não existe nenhum super admin.
 */
export async function bootstrapSuperAdmin(
  input: unknown,
): Promise<ActionResult> {
  try {
    if (await hasSuperAdmin()) {
      return { error: "A instância já possui um super administrador." };
    }
    const data = bootstrapAdminSchema.parse(input);

    await db.insert(users).values({
      name: data.name,
      email: normalizeEmail(data.email),
      role: "super_admin",
      passwordHash: hashSync(data.password, 10),
      companyId: null,
    });

    invalidateSetupCache();
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe um usuário cadastrado com este e-mail.",
    });
  }
}
