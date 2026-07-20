import { and, eq, inArray, sql, type Column, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { UserRole } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { adminCompanyAssignments, projectMembers } from "@/lib/db/schema";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: UserRole;
  companyId: string | null;
  /** Super admin que iniciou a impersonação (auto-login), quando houver. */
  impersonatedBy?: string | null;
};

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Usuário da sessão ou null (não autenticado). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    image: session.user.image,
    role: session.user.role,
    companyId: session.user.companyId ?? null,
    impersonatedBy: session.user.impersonatedBy ?? null,
  };
}

/** Exige autenticação — redireciona para /login caso contrário. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function isTeam(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

/** Exige membro da equipe interna (super_admin ou admin). */
export function requireTeam(user: SessionUser): void {
  if (!isTeam(user.role)) throw new ForbiddenError();
}

/** Exige super admin. */
export function requireSuperAdmin(user: SessionUser): void {
  if (user.role !== "super_admin") throw new ForbiddenError();
}

/** IDs das empresas atribuídas a um admin. */
export async function getAssignedCompanyIds(adminId: string): Promise<string[]> {
  const rows = await db
    .select({ companyId: adminCompanyAssignments.companyId })
    .from(adminCompanyAssignments)
    .where(eq(adminCompanyAssignments.adminId, adminId));
  return rows.map((r) => r.companyId);
}

/**
 * Escopo de empresas visíveis:
 * - super_admin → null (todas)
 * - admin → ids atribuídos (vazio = nenhuma)
 * - client → apenas a própria empresa
 */
export async function visibleCompanyIds(
  user: SessionUser,
): Promise<string[] | null> {
  if (user.role === "super_admin") return null;
  if (user.role === "admin") return getAssignedCompanyIds(user.id);
  return user.companyId ? [user.companyId] : [];
}

/** Garante que o usuário pode acessar a empresa informada. */
export async function assertCompanyAccess(
  user: SessionUser,
  companyId: string,
): Promise<void> {
  if (user.role === "super_admin") return;
  const ids = await visibleCompanyIds(user);
  if (!ids || !ids.includes(companyId)) throw new ForbiddenError();
}

/** IDs dos projetos em que o usuário é membro (project_members). */
export async function memberProjectIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return rows.map((r) => r.projectId);
}

/**
 * Garante acesso ao projeto:
 * - super_admin → sempre
 * - admin → empresa do projeto atribuída a ele OU membro do projeto
 * - demais → proibido
 */
export async function assertProjectAccess(
  user: SessionUser,
  project: { id: string; companyId: string },
): Promise<void> {
  if (user.role === "super_admin") return;
  if (user.role === "admin") {
    const assigned = await getAssignedCompanyIds(user.id);
    if (assigned.includes(project.companyId)) return;
    const [membership] = await db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, project.id),
          eq(projectMembers.userId, user.id),
        ),
      )
      .limit(1);
    if (membership) return;
  }
  throw new ForbiddenError();
}

/**
 * Escopo de listagem de projetos/tarefas:
 * - super_admin → null (todos)
 * - admin → empresas atribuídas + projetos em que é membro
 * - demais → vazio (não vê nada)
 */
export type ProjectScope = {
  companyIds: string[];
  projectIds: string[];
} | null;

export async function visibleProjectScope(
  user: SessionUser,
): Promise<ProjectScope> {
  if (user.role === "super_admin") return null;
  if (user.role === "admin") {
    const [companyIds, projectIds] = await Promise.all([
      getAssignedCompanyIds(user.id),
      memberProjectIds(user.id),
    ]);
    return { companyIds, projectIds };
  }
  return { companyIds: [], projectIds: [] };
}

/** inArray com guarda: lista vazia vira condição sempre falsa (não vê nada). */
export function inColumn<T extends Column>(column: T, values: string[]): SQL {
  return values.length > 0 ? inArray(column, values) : sql`false`;
}

/** Atalho: exige equipe + acesso à empresa. */
export async function requireTeamCompanyAccess(
  user: SessionUser,
  companyId: string,
): Promise<void> {
  requireTeam(user);
  await assertCompanyAccess(user, companyId);
}
