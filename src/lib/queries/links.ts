import { desc, eq } from "drizzle-orm";

import {
  assertCompanyAccess,
  requireTeam,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { projectLinks, projects, type ProjectLink } from "@/lib/db/schema";

/** Links temporários do projeto — lança ForbiddenError fora do escopo. */
export async function listProjectLinks(
  user: SessionUser,
  projectId: string,
): Promise<ProjectLink[]> {
  requireTeam(user);

  const [project] = await db
    .select({ companyId: projects.companyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return [];
  await assertCompanyAccess(user, project.companyId);

  return db
    .select()
    .from(projectLinks)
    .where(eq(projectLinks.projectId, projectId))
    .orderBy(desc(projectLinks.createdAt));
}
