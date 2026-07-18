import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse, type NextRequest } from "next/server";

import {
  ForbiddenError,
  requireTeam,
  requireUser,
  visibleCompanyIds,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  attachments,
  comments,
  companies,
  demands,
  projects,
  tasks,
  users,
} from "@/lib/db/schema";

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

export type SearchResults = {
  companies: SearchResultItem[];
  projects: SearchResultItem[];
  tasks: SearchResultItem[];
  demands: SearchResultItem[];
  users: SearchResultItem[];
  files: SearchResultItem[];
};

const EMPTY: SearchResults = {
  companies: [],
  projects: [],
  tasks: [],
  demands: [],
  users: [],
  files: [],
};

const companyNameSql = sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`;

/**
 * GET /api/search?q=... — pesquisa global do admin (paleta Cmd+K).
 * Tudo escopado por visibleCompanyIds; limite de 5 resultados por grupo.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    requireTeam(user);

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return NextResponse.json(EMPTY);

    const scope = await visibleCompanyIds(user);
    if (scope && scope.length === 0) return NextResponse.json(EMPTY);

    const pattern = `%${q}%`;
    const taskProjects = alias(projects, "task_projects");

    const [companyRows, projectRows, taskRows, commentRows, demandRows, userRows, fileRows] =
      await Promise.all([
        db
          .select({ id: companies.id, name: companyNameSql, cnpj: companies.cnpj, cidade: companies.cidade })
          .from(companies)
          .where(
            and(
              or(
                ilike(companies.nomeFantasia, pattern),
                ilike(companies.razaoSocial, pattern),
                ilike(companies.cnpj, pattern),
              ),
              scope ? inArray(companies.id, scope) : undefined,
            ),
          )
          .orderBy(asc(companies.nomeFantasia))
          .limit(5),
        db
          .select({ id: projects.id, name: projects.name, companyName: companyNameSql })
          .from(projects)
          .innerJoin(companies, eq(projects.companyId, companies.id))
          .where(
            and(
              ilike(projects.name, pattern),
              scope ? inArray(projects.companyId, scope) : undefined,
            ),
          )
          .orderBy(asc(projects.name))
          .limit(5),
        db
          .select({ id: tasks.id, title: tasks.title, projectName: projects.name })
          .from(tasks)
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(
            and(
              ilike(tasks.title, pattern),
              scope ? inArray(projects.companyId, scope) : undefined,
            ),
          )
          .orderBy(asc(tasks.title))
          .limit(5),
        db
          .select({
            id: comments.id,
            body: comments.body,
            taskId: tasks.id,
            taskTitle: tasks.title,
          })
          .from(comments)
          .innerJoin(tasks, eq(comments.taskId, tasks.id))
          .innerJoin(projects, eq(tasks.projectId, projects.id))
          .where(
            and(
              ilike(comments.body, pattern),
              scope ? inArray(projects.companyId, scope) : undefined,
            ),
          )
          .orderBy(desc(comments.createdAt))
          .limit(5),
        db
          .select({ id: demands.id, title: demands.title, companyName: companyNameSql })
          .from(demands)
          .innerJoin(companies, eq(demands.companyId, companies.id))
          .where(
            and(
              ilike(demands.title, pattern),
              scope ? inArray(demands.companyId, scope) : undefined,
            ),
          )
          .orderBy(desc(demands.createdAt))
          .limit(5),
        db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(
            and(
              or(eq(users.role, "super_admin"), eq(users.role, "admin")),
              or(ilike(users.name, pattern), ilike(users.email, pattern)),
            ),
          )
          .orderBy(asc(users.name))
          .limit(5),
        db
          .select({
            id: attachments.id,
            fileName: attachments.fileName,
            projectName: projects.name,
            taskProjectName: taskProjects.name,
            demandTitle: demands.title,
          })
          .from(attachments)
          .leftJoin(projects, eq(attachments.projectId, projects.id))
          .leftJoin(tasks, eq(attachments.taskId, tasks.id))
          .leftJoin(taskProjects, eq(tasks.projectId, taskProjects.id))
          .leftJoin(demands, eq(attachments.demandId, demands.id))
          .where(
            and(
              ilike(attachments.fileName, pattern),
              scope
                ? or(
                    inArray(projects.companyId, scope),
                    inArray(taskProjects.companyId, scope),
                    inArray(demands.companyId, scope),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(attachments.createdAt))
          .limit(5),
      ]);

    // Comentários entram no grupo de tarefas (link para a tarefa), sem duplicar hrefs
    const taskItems: SearchResultItem[] = taskRows.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.projectName,
      href: `/admin/tarefas/${r.id}`,
    }));
    const seenHrefs = new Set(taskItems.map((i) => i.href));
    for (const c of commentRows) {
      if (taskItems.length >= 5) break;
      const href = `/admin/tarefas/${c.taskId}`;
      if (seenHrefs.has(href)) continue;
      seenHrefs.add(href);
      taskItems.push({
        id: c.id,
        title: c.taskTitle,
        subtitle: `Comentário: "${c.body.slice(0, 80)}"`,
        href,
      });
    }

    const results: SearchResults = {
      companies: companyRows.map((r) => ({
        id: r.id,
        title: r.name,
        subtitle: r.cnpj ?? r.cidade,
        href: `/admin/clientes/${r.id}`,
      })),
      projects: projectRows.map((r) => ({
        id: r.id,
        title: r.name,
        subtitle: r.companyName,
        href: `/admin/projetos/${r.id}`,
      })),
      tasks: taskItems,
      demands: demandRows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.companyName,
        href: "/admin/demandas",
      })),
      users: userRows.map((r) => ({
        id: r.id,
        title: r.name,
        subtitle: r.email,
        href: "/admin/equipe",
      })),
      files: fileRows.map((r) => ({
        id: r.id,
        title: r.fileName,
        subtitle: r.taskProjectName ?? r.projectName ?? r.demandTitle,
        href: `/api/files/${r.id}`,
      })),
    };

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
