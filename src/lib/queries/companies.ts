import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import {
  assertCompanyAccess,
  requireTeam,
  requireTeamCompanyAccess,
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  adminCompanyAssignments,
  companies,
  users,
  type Company,
  type User,
} from "@/lib/db/schema";

export type CompanyListItem = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  cidade: string | null;
  estado: string | null;
  email: string | null;
  whatsapp: string | null;
  status: Company["status"];
};

export type CompanyUserItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  position: string | null;
  status: User["status"];
  isCompanyAdmin: boolean;
};

export type CompanyAdminItem = {
  id: string;
  name: string;
  email: string;
};

/** Lista empresas dentro do escopo do usuário, com filtro opcional por nome/CNPJ. */
export async function listCompanies(
  user: SessionUser,
  search?: string,
): Promise<CompanyListItem[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(companies.id, scope));

  const q = search?.trim();
  if (q) {
    const like = `%${q}%`;
    const filters = [
      ilike(companies.razaoSocial, like),
      ilike(companies.nomeFantasia, like),
      ilike(companies.cnpj, like),
    ];
    // Busca só por dígitos também casa com o CNPJ sem pontuação
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) {
      filters.push(
        sql`regexp_replace(${companies.cnpj}, '\\D', '', 'g') like ${`%${digits}%`}`,
      );
    }
    const searchFilter = or(...filters);
    if (searchFilter) conditions.push(searchFilter);
  }

  return db
    .select({
      id: companies.id,
      razaoSocial: companies.razaoSocial,
      nomeFantasia: companies.nomeFantasia,
      cnpj: companies.cnpj,
      cidade: companies.cidade,
      estado: companies.estado,
      email: companies.email,
      whatsapp: companies.whatsapp,
      status: companies.status,
    })
    .from(companies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(companies.razaoSocial));
}

/** Empresa por id — lança ForbiddenError quando fora do escopo. */
export async function getCompany(
  user: SessionUser,
  id: string,
): Promise<Company | null> {
  requireTeam(user);
  await assertCompanyAccess(user, id);
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);
  return company ?? null;
}

/** Usuários cliente (portal) vinculados à empresa. */
export async function listCompanyUsers(
  user: SessionUser,
  companyId: string,
): Promise<CompanyUserItem[]> {
  await requireTeamCompanyAccess(user, companyId);
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      position: users.position,
      status: users.status,
      isCompanyAdmin: users.isCompanyAdmin,
    })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, "client")))
    .orderBy(asc(users.name));
}

/** Membros da equipe atribuídos à empresa (visão do super_admin). */
export async function listCompanyAdmins(
  companyId: string,
): Promise<CompanyAdminItem[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(adminCompanyAssignments)
    .innerJoin(users, eq(adminCompanyAssignments.adminId, users.id))
    .where(eq(adminCompanyAssignments.companyId, companyId))
    .orderBy(asc(users.name));
}
