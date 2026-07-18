import { and, asc, inArray, or, eq } from "drizzle-orm";

import {
  requireSuperAdmin,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  adminCompanyAssignments,
  companies,
  users,
  type User,
} from "@/lib/db/schema";

export type TeamUserItem = {
  id: string;
  name: string;
  email: string;
  position: string | null;
  role: "super_admin" | "admin";
  status: User["status"];
  assignedCount: number;
};

export type CompanySelectItem = {
  id: string;
  name: string;
};

/** Usuários da equipe interna (super_admin/admin) com nº de empresas atribuídas. */
export async function listTeamUsers(user: SessionUser): Promise<TeamUserItem[]> {
  requireSuperAdmin(user);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      position: users.position,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(or(eq(users.role, "super_admin"), eq(users.role, "admin")))
    .orderBy(asc(users.name));

  if (rows.length === 0) return [];

  const assignments = await db
    .select({ adminId: adminCompanyAssignments.adminId })
    .from(adminCompanyAssignments)
    .where(
      inArray(
        adminCompanyAssignments.adminId,
        rows.map((r) => r.id),
      ),
    );

  const counts = new Map<string, number>();
  for (const a of assignments) {
    counts.set(a.adminId, (counts.get(a.adminId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    ...r,
    role: r.role as TeamUserItem["role"],
    assignedCount: counts.get(r.id) ?? 0,
  }));
}

/** Mapa adminId → ids de empresas atribuídas (estado inicial do diálogo de atribuições). */
export async function listAllAssignments(
  user: SessionUser,
): Promise<Record<string, string[]>> {
  requireSuperAdmin(user);
  const rows = await db
    .select({
      adminId: adminCompanyAssignments.adminId,
      companyId: adminCompanyAssignments.companyId,
    })
    .from(adminCompanyAssignments);

  const map: Record<string, string[]> = {};
  for (const row of rows) {
    (map[row.adminId] ??= []).push(row.companyId);
  }
  return map;
}

/** Todas as empresas, para seleção (diálogo de atribuições — uso restrito a super_admin). */
export async function listAllCompaniesForSelect(): Promise<CompanySelectItem[]> {
  const rows = await db
    .select({
      id: companies.id,
      razaoSocial: companies.razaoSocial,
      nomeFantasia: companies.nomeFantasia,
    })
    .from(companies)
    .orderBy(asc(companies.razaoSocial));

  return rows.map((r) => ({ id: r.id, name: r.nomeFantasia || r.razaoSocial }));
}

/** Membros ativos da equipe, para selects de responsável (qualquer membro da equipe). */
export async function listTeamSelectOptions(
  user: SessionUser,
): Promise<CompanySelectItem[]> {
  requireTeam(user);
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        or(eq(users.role, "super_admin"), eq(users.role, "admin")),
        eq(users.status, "active"),
      ),
    )
    .orderBy(asc(users.name));
}
