import { differenceInCalendarDays, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  inColumn,
  requireTeam,
  visibleProjectScope,
  type ProjectScope,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  activities,
  attachments,
  charges,
  comments,
  companies,
  demands,
  projects,
  projectStatuses,
  quotes,
  tasks,
  taskStatuses,
  users,
} from "@/lib/db/schema";
import type { ActivityItem } from "@/lib/queries/activities";

export type DashboardCounts = {
  projectsActive: number;
  projectsDone: number;
  projectsOverdue: number;
  demandsOpen: number;
  demandsInProgress: number;
  demandsDone: number;
  clientsActive: number;
  /** Orçamentos enviados aguardando resposta do cliente. */
  quotesPending: number;
  chargesOpen: number;
  chargesOverdue: number;
  chargesOpenCents: number;
  chargesReceivedMonthCents: number;
};

export type UpcomingItem = {
  kind: "project" | "task";
  id: string;
  title: string;
  /** Empresa (projeto) ou projeto (tarefa). */
  subtitle: string;
  dueDate: string;
  /** Dias até o prazo; negativo = vencido. */
  daysLeft: number;
  href: string;
};

export type DashboardUpload = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
  uploaderName: string | null;
  /** Projeto, tarefa ou demanda onde o arquivo foi anexado. */
  origin: string | null;
  href: string;
};

export type DashboardComment = {
  id: string;
  excerpt: string;
  createdAt: Date;
  authorName: string | null;
  taskTitle: string;
  href: string;
};

/** Receita mensal (cobranças pagas) para o gráfico da dashboard. */
export type RevenueMonth = {
  /** "2026-07" */
  key: string;
  /** "jul" */
  label: string;
  cents: number;
};

export type AdminDashboardData = {
  counts: DashboardCounts;
  revenueByMonth: RevenueMonth[];
  /** Próximas cobranças em aberto (a receber), por vencimento. */
  receivables: ReceivableItem[];
  upcoming: UpcomingItem[];
  activities: ActivityItem[];
  uploads: DashboardUpload[];
  comments: DashboardComment[];
};

/** Cobrança em aberto para o card "A receber". */
export type ReceivableItem = {
  id: string;
  description: string;
  valueCents: number;
  dueDate: string;
  companyName: string;
  status: "pending" | "overdue";
  /** Dias até o vencimento; negativo = vencida. */
  daysLeft: number;
};

const EMPTY_DATA: AdminDashboardData = {
  counts: {
    projectsActive: 0,
    projectsDone: 0,
    projectsOverdue: 0,
    demandsOpen: 0,
    demandsInProgress: 0,
    demandsDone: 0,
    clientsActive: 0,
    quotesPending: 0,
    chargesOpen: 0,
    chargesOverdue: 0,
    chargesOpenCents: 0,
    chargesReceivedMonthCents: 0,
  },
  revenueByMonth: [],
  receivables: [],
  upcoming: [],
  activities: [],
  uploads: [],
  comments: [],
};

/**
 * Visão geral da operação.
 * Projetos/tarefas: empresa atribuída OU projeto em que é membro.
 * Financeiro/demandas/clientes: somente empresas atribuídas.
 */
export async function getAdminDashboard(
  user: SessionUser,
): Promise<AdminDashboardData> {
  requireTeam(user);
  const scope = await visibleProjectScope(user);
  if (scope && scope.companyIds.length === 0 && scope.projectIds.length === 0) {
    return EMPTY_DATA;
  }

  // Projetos/tarefas: empresa atribuída OU projeto em que é membro
  const projectsScope: SQL | undefined = scope
    ? or(
        inColumn(projects.companyId, scope.companyIds),
        inColumn(projects.id, scope.projectIds),
      )
    : undefined;
  const companyIds = scope?.companyIds ?? [];

  const [projectCountRows, demandCountRows, clientCountRows, quoteCountRows, chargeCountRows] =
    await Promise.all([
      db
        .select({
          active: sql<number>`count(*) filter (where not coalesce(${projectStatuses.isFinal}, false))::int`,
          done: sql<number>`count(*) filter (where coalesce(${projectStatuses.isFinal}, false))::int`,
          overdue: sql<number>`count(*) filter (where not coalesce(${projectStatuses.isFinal}, false) and ${projects.dueDate} < current_date)::int`,
        })
        .from(projects)
        .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
        .where(projectsScope),
      db
        .select({
          open: sql<number>`count(*) filter (where ${demands.status} = 'aberta')::int`,
          inProgress: sql<number>`count(*) filter (where ${demands.status} in ('em_analise', 'em_andamento'))::int`,
          done: sql<number>`count(*) filter (where ${demands.status} = 'concluida')::int`,
        })
        .from(demands)
        .where(scope ? inColumn(demands.companyId, companyIds) : undefined),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(companies)
        .where(
          and(
            eq(companies.status, "ativo"),
            scope ? inColumn(companies.id, companyIds) : undefined,
          ),
        ),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(quotes)
        .where(
          and(
            eq(quotes.status, "sent"),
            scope ? inColumn(quotes.companyId, companyIds) : undefined,
          ),
        ),
      db
        .select({
          openCount: sql<number>`count(*) filter (where ${charges.status} in ('pending', 'overdue'))::int`,
          openCents: sql<number>`coalesce(sum(${charges.valueCents}) filter (where ${charges.status} in ('pending', 'overdue')), 0)::int`,
          overdueCount: sql<number>`count(*) filter (where ${charges.status} = 'overdue')::int`,
          receivedMonthCents: sql<number>`coalesce(sum(${charges.valueCents}) filter (where ${charges.status} in ('received', 'confirmed') and date_trunc('month', ${charges.paidAt}) = date_trunc('month', current_date)), 0)::int`,
        })
        .from(charges)
        .where(scope ? inColumn(charges.companyId, companyIds) : undefined),
    ]);

  const [upcoming, activityRows, uploadRows, commentRows, revenueByMonth, receivables] =
    await Promise.all([
      listUpcoming(scope),
      listRecentActivities(scope),
      listRecentUploads(scope),
      listRecentComments(scope),
      listRevenueByMonth(scope ? companyIds : null),
      listReceivables(scope ? companyIds : null),
    ]);

  const projectCounts = projectCountRows[0];
  const demandCounts = demandCountRows[0];
  const chargeCounts = chargeCountRows[0];

  return {
    counts: {
      projectsActive: projectCounts?.active ?? 0,
      projectsDone: projectCounts?.done ?? 0,
      projectsOverdue: projectCounts?.overdue ?? 0,
      demandsOpen: demandCounts?.open ?? 0,
      demandsInProgress: demandCounts?.inProgress ?? 0,
      demandsDone: demandCounts?.done ?? 0,
      clientsActive: clientCountRows[0]?.value ?? 0,
      quotesPending: quoteCountRows[0]?.value ?? 0,
      chargesOpen: chargeCounts?.openCount ?? 0,
      chargesOverdue: chargeCounts?.overdueCount ?? 0,
      chargesOpenCents: chargeCounts?.openCents ?? 0,
      chargesReceivedMonthCents: chargeCounts?.receivedMonthCents ?? 0,
    },
    revenueByMonth,
    receivables,
    upcoming,
    activities: activityRows,
    uploads: uploadRows,
    comments: commentRows,
  };
}

/** Próximas cobranças em aberto (pending/overdue) por vencimento — limite 6. */
async function listReceivables(
  scope: string[] | null,
): Promise<ReceivableItem[]> {
  const conditions: SQL[] = [
    inArray(charges.status, ["pending", "overdue"]),
  ];
  if (scope) conditions.push(inColumn(charges.companyId, scope));

  const rows = await db
    .select({
      id: charges.id,
      description: charges.description,
      valueCents: charges.valueCents,
      dueDate: charges.dueDate,
      status: charges.status,
      companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
    })
    .from(charges)
    .innerJoin(companies, eq(charges.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(asc(charges.dueDate))
    .limit(6);

  const today = new Date();
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    valueCents: r.valueCents,
    dueDate: r.dueDate,
    companyName: r.companyName,
    status: r.status as "pending" | "overdue",
    daysLeft: differenceInCalendarDays(parseISO(r.dueDate), today),
  }));
}

/** Projetos e tarefas com prazo vencido ou nos próximos 30 dias (limite 10). */
async function listUpcoming(
  scope: ProjectScope,
): Promise<UpcomingItem[]> {
  const projectConditions: SQL[] = [
    isNotNull(projects.dueDate),
    sql`${projects.dueDate} <= current_date + interval '30 days'`,
    or(isNull(projectStatuses.isFinal), eq(projectStatuses.isFinal, false))!,
  ];
  const taskConditions: SQL[] = [
    isNotNull(tasks.dueDate),
    sql`${tasks.dueDate} <= current_date + interval '30 days'`,
    or(isNull(taskStatuses.isFinal), eq(taskStatuses.isFinal, false))!,
    isNull(tasks.completedAt),
  ];
  if (scope) {
    // Empresa atribuída OU projeto em que é membro
    const scopeCondition = or(
      inColumn(projects.companyId, scope.companyIds),
      inColumn(projects.id, scope.projectIds),
    )!;
    projectConditions.push(scopeCondition);
    taskConditions.push(scopeCondition);
  }

  const [projectRows, taskRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        dueDate: projects.dueDate,
        companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
      })
      .from(projects)
      .innerJoin(companies, eq(projects.companyId, companies.id))
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .where(and(...projectConditions))
      .orderBy(asc(projects.dueDate))
      .limit(10),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
      .where(and(...taskConditions))
      .orderBy(asc(tasks.dueDate))
      .limit(10),
  ]);

  const today = new Date();
  const items: UpcomingItem[] = [
    ...projectRows
      .filter((r): r is typeof r & { dueDate: string } => r.dueDate !== null)
      .map((r) => ({
        kind: "project" as const,
        id: r.id,
        title: r.name,
        subtitle: r.companyName,
        dueDate: r.dueDate,
        daysLeft: differenceInCalendarDays(parseISO(r.dueDate), today),
        href: `/admin/projetos/${r.id}`,
      })),
    ...taskRows
      .filter((r): r is typeof r & { dueDate: string } => r.dueDate !== null)
      .map((r) => ({
        kind: "task" as const,
        id: r.id,
        title: r.title,
        subtitle: r.projectName,
        dueDate: r.dueDate,
        daysLeft: differenceInCalendarDays(parseISO(r.dueDate), today),
        href: `/admin/tarefas/${r.id}`,
      })),
  ];

  return items
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 10);
}

/** Receita dos últimos 6 meses (cobranças pagas, agrupadas por mês de pagamento). */
async function listRevenueByMonth(
  scope: string[] | null,
): Promise<RevenueMonth[]> {
  const conditions: SQL[] = [
    inArray(charges.status, ["received", "confirmed"]),
    isNotNull(charges.paidAt),
    sql`${charges.paidAt} >= date_trunc('month', current_date) - interval '5 months'`,
  ];
  if (scope) conditions.push(inColumn(charges.companyId, scope));

  const rows = await db
    .select({
      key: sql<string>`to_char(date_trunc('month', ${charges.paidAt}), 'YYYY-MM')`,
      cents: sql<number>`coalesce(sum(${charges.valueCents}), 0)::int`,
    })
    .from(charges)
    .where(and(...conditions))
    .groupBy(sql`date_trunc('month', ${charges.paidAt})`);

  const byMonth = new Map(rows.map((r) => [r.key, r.cents]));

  // Série completa dos 6 meses (zero onde não houve receita)
  return Array.from({ length: 6 }, (_, index) => {
    const month = startOfMonth(subMonths(new Date(), 5 - index));
    const key = format(month, "yyyy-MM");
    return {
      key,
      label: format(month, "MMM", { locale: ptBR }).replace(".", ""),
      cents: byMonth.get(key) ?? 0,
    };
  });
}

/** Últimas 10 atividades do escopo, com o autor. */
async function listRecentActivities(
  scope: ProjectScope,
): Promise<ActivityItem[]> {
  const conditions: SQL[] = [];
  if (scope) {
    // Empresa atribuída OU atividade de projeto em que é membro
    conditions.push(
      or(
        inColumn(activities.companyId, scope.companyIds),
        inColumn(activities.projectId, scope.projectIds),
      )!,
    );
  }

  const rows = await db
    .select({
      id: activities.id,
      action: activities.action,
      entityType: activities.entityType,
      entityId: activities.entityId,
      metadata: activities.metadata,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorName: users.name,
      actorRole: users.role,
    })
    .from(activities)
    .leftJoin(users, eq(activities.actorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activities.createdAt))
    .limit(10);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt,
    actor: r.actorId
      ? { id: r.actorId, name: r.actorName!, role: r.actorRole! }
      : null,
  }));
}

/** Últimos 8 anexos do escopo, com autor e origem. */
async function listRecentUploads(
  scope: ProjectScope,
): Promise<DashboardUpload[]> {
  const taskProjects = alias(projects, "task_projects");

  const scopeCondition = scope
    ? or(
        inColumn(projects.companyId, scope.companyIds),
        inColumn(projects.id, scope.projectIds),
        inColumn(taskProjects.companyId, scope.companyIds),
        inColumn(taskProjects.id, scope.projectIds),
        inColumn(demands.companyId, scope.companyIds),
      )
    : undefined;

  const rows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      createdAt: attachments.createdAt,
      uploaderName: users.name,
      projectName: projects.name,
      taskProjectName: taskProjects.name,
      demandTitle: demands.title,
    })
    .from(attachments)
    .leftJoin(projects, eq(attachments.projectId, projects.id))
    .leftJoin(tasks, eq(attachments.taskId, tasks.id))
    .leftJoin(taskProjects, eq(tasks.projectId, taskProjects.id))
    .leftJoin(demands, eq(attachments.demandId, demands.id))
    .leftJoin(users, eq(attachments.uploadedBy, users.id))
    .where(scopeCondition)
    .orderBy(desc(attachments.createdAt))
    .limit(8);

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    createdAt: r.createdAt,
    uploaderName: r.uploaderName,
    origin: r.taskProjectName ?? r.projectName ?? r.demandTitle ?? null,
    href: `/api/files/${r.id}`,
  }));
}

/** Últimos 8 comentários do escopo, com autor e tarefa. */
async function listRecentComments(
  scope: ProjectScope,
): Promise<DashboardComment[]> {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      authorName: users.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
    })
    .from(comments)
    .innerJoin(tasks, eq(comments.taskId, tasks.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(comments.authorId, users.id))
    .where(
      scope
        ? or(
            inColumn(projects.companyId, scope.companyIds),
            inColumn(projects.id, scope.projectIds),
          )
        : undefined,
    )
    .orderBy(desc(comments.createdAt))
    .limit(8);

  return rows.map((r) => ({
    id: r.id,
    excerpt: r.body.slice(0, 140),
    createdAt: r.createdAt,
    authorName: r.authorName,
    taskTitle: r.taskTitle,
    href: `/admin/tarefas/${r.taskId}`,
  }));
}
