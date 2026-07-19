import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import {
  requireTeam,
  requireTeamCompanyAccess,
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  companies,
  demands,
  milestones,
  projects,
  users,
  type Demand,
} from "@/lib/db/schema";

export type DemandListItem = {
  id: string;
  title: string;
  description: string;
  category: Demand["category"];
  priority: Demand["priority"];
  status: Demand["status"];
  taskId: string | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: Date;
  companyId: string;
  companyName: string;
  authorName: string | null;
};

export type DemandListFilters = {
  status?: Demand["status"];
  companyId?: string;
};

/** Lista demandas dentro do escopo do usuário, com filtro opcional por status/empresa. */
export async function listDemands(
  user: SessionUser,
  filters: DemandListFilters = {},
): Promise<DemandListItem[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(demands.companyId, scope));
  if (filters.companyId)
    conditions.push(eq(demands.companyId, filters.companyId));
  if (filters.status) conditions.push(eq(demands.status, filters.status));

  const rows = await db
    .select({
      id: demands.id,
      title: demands.title,
      description: demands.description,
      category: demands.category,
      priority: demands.priority,
      status: demands.status,
      taskId: demands.taskId,
      projectId: demands.projectId,
      projectName: projects.name,
      createdAt: demands.createdAt,
      companyId: companies.id,
      companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
      authorName: users.name,
    })
    .from(demands)
    .innerJoin(companies, eq(demands.companyId, companies.id))
    .leftJoin(projects, eq(demands.projectId, projects.id))
    .leftJoin(users, eq(demands.createdBy, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(demands.createdAt));

  return rows;
}

/** Quantidade de demandas abertas no escopo (badge da página). */
export async function countOpenDemands(user: SessionUser): Promise<number> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return 0;

  const conditions: SQL[] = [eq(demands.status, "aberta")];
  if (scope) conditions.push(inArray(demands.companyId, scope));

  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(demands)
    .where(and(...conditions));
  return row?.value ?? 0;
}

/** Projetos da empresa, para o select do diálogo de conversão. */
export async function listCompanyProjectsForSelect(
  user: SessionUser,
  companyId: string,
): Promise<{ id: string; name: string }[]> {
  await requireTeamCompanyAccess(user, companyId);
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.companyId, companyId))
    .orderBy(asc(projects.name));
}

/** Etapas de todos os projetos das empresas visíveis (diálogo de conversão). */
export async function listScopedMilestones(
  user: SessionUser,
): Promise<{ id: string; name: string; projectId: string }[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(projects.companyId, scope));

  return db
    .select({
      id: milestones.id,
      name: milestones.name,
      projectId: milestones.projectId,
    })
    .from(milestones)
    .innerJoin(projects, eq(milestones.projectId, projects.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(milestones.position), asc(milestones.createdAt));
}
