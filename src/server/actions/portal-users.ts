"use server";

import { hashSync } from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  ForbiddenError,
  requireUser,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  portalUserCreateSchema,
  portalUserUpdateSchema,
} from "@/lib/validations/portal";
import {
  actionError,
  normalizeEmail,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

/**
 * Gestão dos usuários da própria empresa pelo portal (admin da empresa).
 * Tudo é limitado ao companyId do usuário logado e o flag de admin é
 * conferido FRESCO no banco em cada action (a sessão JWT não o carrega).
 */

/** Exige cliente admin da empresa e retorna o companyId dele. */
async function requireCompanyAdmin(user: SessionUser): Promise<string> {
  if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
  const [row] = await db
    .select({ isCompanyAdmin: users.isCompanyAdmin })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row?.isCompanyAdmin) throw new ForbiddenError();
  return user.companyId;
}

/** Cria usuário cliente na empresa do admin logado (sempre role "client"). */
export async function createPortalCompanyUser(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const companyId = await requireCompanyAdmin(user);
    const data = portalUserCreateSchema.parse(input);

    const email = normalizeEmail(data.email);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) return { error: "Este e-mail já está em uso." };

    await db.insert(users).values({
      name: data.name,
      email,
      phone: nullIfEmpty(data.phone),
      position: nullIfEmpty(data.position),
      passwordHash: hashSync(data.password, 10),
      role: "client",
      status: data.status,
      isCompanyAdmin: data.isCompanyAdmin,
      companyId,
    });

    revalidatePath("/portal/usuarios");
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Este e-mail já está em uso.",
    });
  }
}

/** Edita usuário cliente da empresa do admin logado (senha em branco mantém). */
export async function updatePortalCompanyUser(
  userId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const companyId = await requireCompanyAdmin(user);
    const data = portalUserUpdateSchema.parse(input);

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
    if (!target) return { error: "Usuário não encontrado na sua empresa." };

    // Proteção contra lockout: o admin não remove o próprio acesso à gestão
    if (target.id === user.id) {
      if (!data.isCompanyAdmin) {
        return {
          error:
            "Você não pode remover o seu próprio acesso de admin. Peça a outro admin da empresa ou à equipe WordPane.",
        };
      }
      if (data.status === "suspended") {
        return { error: "Você não pode suspender a sua própria conta." };
      }
    }

    const email = normalizeEmail(data.email);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, userId)))
      .limit(1);
    if (existing) return { error: "Este e-mail já está em uso." };

    // Senha em branco na edição mantém a atual
    const password = data.password?.trim();

    await db
      .update(users)
      .set({
        name: data.name,
        email,
        phone: nullIfEmpty(data.phone),
        position: nullIfEmpty(data.position),
        status: data.status,
        isCompanyAdmin: data.isCompanyAdmin,
        ...(password ? { passwordHash: hashSync(password, 10) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    revalidatePath("/portal/usuarios");
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Este e-mail já está em uso.",
    });
  }
}
