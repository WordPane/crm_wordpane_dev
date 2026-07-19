"use server";

import { encode } from "@auth/core/jwt";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireSuperAdmin, requireUser } from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";

/** Mesma duração da sessão normal (7 dias, ver src/lib/auth/index.ts). */
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Nome do cookie de sessão (prefixo __Secure- quando o app roda em HTTPS). */
function sessionCookieName(): string {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  return url.startsWith("https://")
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

/** Cookie com a sessão original do super admin durante a impersonação. */
const BACKUP_COOKIE = "wordpane.impersonator";

/**
 * Auto-login do super admin em um usuário cliente (impersonação):
 * grava um JWT de sessão daquele usuário e redireciona ao portal.
 * A sessão original fica em cookie de backup para ser restaurada ao sair.
 * O evento fica registrado na timeline da empresa.
 */
export async function impersonateUser(userId: string): Promise<never> {
  const admin = await requireUser();
  requireSuperAdmin(admin);

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (
    !target ||
    target.role !== "client" ||
    target.status === "suspended" ||
    !target.companyId
  ) {
    redirect("/admin/clientes");
  }

  const cookieName = sessionCookieName();
  const jar = await cookies();

  // Guarda a sessão do super admin para restaurar ao sair da impersonação
  const currentToken = jar.get(cookieName)?.value;
  if (currentToken) {
    jar.set(BACKUP_COOKIE, currentToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: cookieName.startsWith("__Secure-"),
      maxAge: SESSION_MAX_AGE,
    });
  }

  const token = await encode({
    token: {
      id: target.id,
      sub: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      companyId: target.companyId,
      impersonatedBy: admin.id,
    },
    secret: process.env.AUTH_SECRET!,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
  });

  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieName.startsWith("__Secure-"),
    maxAge: SESSION_MAX_AGE,
  });

  const [company] = await db
    .select({ nomeFantasia: companies.nomeFantasia, razaoSocial: companies.razaoSocial })
    .from(companies)
    .where(eq(companies.id, target.companyId))
    .limit(1);

  await logActivity({
    actorId: admin.id,
    companyId: target.companyId,
    entityType: "company",
    entityId: target.companyId,
    action: "auth.impersonated",
    metadata: {
      admin: admin.name,
      user: target.name,
      email: target.email,
      company: company?.nomeFantasia ?? company?.razaoSocial ?? "",
    },
  });

  redirect("/portal/dashboard");
}

/**
 * Encerra a impersonação: restaura a sessão original do super admin
 * e volta para o admin. Sem backup, vai para o login.
 */
export async function stopImpersonation(): Promise<never> {
  const cookieName = sessionCookieName();
  const jar = await cookies();
  const backup = jar.get(BACKUP_COOKIE)?.value;

  jar.delete(BACKUP_COOKIE);

  if (backup) {
    jar.set(cookieName, backup, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: cookieName.startsWith("__Secure-"),
      maxAge: SESSION_MAX_AGE,
    });
    redirect("/admin/dashboard");
  }

  redirect("/login");
}
