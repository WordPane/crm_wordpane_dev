"use server";

import { hashSync } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireTeamCompanyAccess, requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  companyUserCreateSchema,
  companyUserUpdateSchema,
} from "@/lib/validations/user";
import {
  actionError,
  normalizeEmail,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

export async function createCompanyUser(
  companyId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await requireTeamCompanyAccess(user, companyId);
    const data = companyUserCreateSchema.parse(input);

    await db.insert(users).values({
      name: data.name,
      email: normalizeEmail(data.email),
      phone: nullIfEmpty(data.phone),
      position: nullIfEmpty(data.position),
      passwordHash: hashSync(data.password, 10),
      role: "client",
      status: data.status,
      companyId,
    });

    revalidatePath(`/admin/clientes/${companyId}`);
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe um usuário cadastrado com este e-mail.",
    });
  }
}

export async function updateCompanyUser(
  companyId: string,
  userId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await requireTeamCompanyAccess(user, companyId);
    const data = companyUserUpdateSchema.parse(input);

    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.companyId, companyId),
          eq(users.role, "client"),
        ),
      )
      .limit(1);
    if (!target) return { error: "Usuário não encontrado nesta empresa." };

    // Senha em branco na edição mantém a atual
    const password = data.password?.trim();

    await db
      .update(users)
      .set({
        name: data.name,
        email: normalizeEmail(data.email),
        phone: nullIfEmpty(data.phone),
        position: nullIfEmpty(data.position),
        status: data.status,
        ...(password ? { passwordHash: hashSync(password, 10) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    revalidatePath(`/admin/clientes/${companyId}`);
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe um usuário cadastrado com este e-mail.",
    });
  }
}
