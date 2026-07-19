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

/**
 * Auto-login do super admin em um usuário cliente (impersonação):
 * grava um JWT de sessão daquele usuário e redireciona ao portal.
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

  const jar = await cookies();
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
