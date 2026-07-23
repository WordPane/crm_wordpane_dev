import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import {
  requireTeam,
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { SQL_THIS_MONTH } from "@/lib/db/business-date";
import type { PeriodRange } from "@/lib/utils/period";
import {
  charges,
  companies,
  companyServices,
  invoices,
  services,
  serviceTeamMembers,
  type Charge,
  type CompanyService,
  type Service,
} from "@/lib/db/schema";

/** Queries do financeiro (admin) — escopo por empresa via visibleCompanyIds. */

const companyName = sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`;

export type ChargeListItem = {
  id: string;
  description: string;
  valueCents: number;
  billingType: Charge["billingType"];
  dueDate: string;
  status: Charge["status"];
  invoiceUrl: string | null;
  paidAt: Date | null;
  createdAt: Date;
  quoteId: string | null;
  company: { id: string; name: string };
  /** Nota fiscal da cobrança (quando emitida). */
  invoice: {
    id: string;
    status: string;
    number: string | null;
    errorMessage: string | null;
  } | null;
};

/** Coluna de data usada pelo filtro de período. */
export type PeriodDateBase = "vencimento" | "pagamento";

/** Condições do filtro de período sobre a cobrança (vencimento ou pagamento). */
function periodConditions(
  period: PeriodRange,
  dateBase: PeriodDateBase = "vencimento",
): SQL[] {
  if (dateBase === "pagamento") {
    // paidAt é timestamp: cobre o dia inteiro (fuso local do servidor)
    return [
      gte(charges.paidAt, new Date(`${period.from}T00:00:00`)),
      lte(charges.paidAt, new Date(`${period.to}T23:59:59.999`)),
    ];
  }
  return [
    gte(charges.dueDate, period.from),
    lte(charges.dueDate, period.to),
  ];
}

/** Cobranças no escopo do usuário (mais recentes primeiro), filtráveis. */
export async function listCharges(
  user: SessionUser,
  filters: {
    status?: Charge["status"];
    companyId?: string;
    /** Intervalo de datas (yyyy-MM-dd, inclusive). */
    period?: PeriodRange;
    /** Coluna do filtro de período: vencimento (padrão) ou pagamento. */
    dateBase?: PeriodDateBase;
  } = {},
): Promise<ChargeListItem[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(charges.companyId, scope));
  if (filters.companyId) conditions.push(eq(charges.companyId, filters.companyId));
  if (filters.status) conditions.push(eq(charges.status, filters.status));
  if (filters.period) {
    conditions.push(...periodConditions(filters.period, filters.dateBase));
  }

  const rows = await db
    .select({
      id: charges.id,
      description: charges.description,
      valueCents: charges.valueCents,
      billingType: charges.billingType,
      dueDate: charges.dueDate,
      status: charges.status,
      invoiceUrl: charges.invoiceUrl,
      paidAt: charges.paidAt,
      createdAt: charges.createdAt,
      quoteId: charges.quoteId,
      companyId: companies.id,
      companyName: companyName,
      invoiceId: invoices.id,
      invoiceStatus: invoices.status,
      invoiceNumber: invoices.number,
      invoiceError: invoices.errorMessage,
    })
    .from(charges)
    .innerJoin(companies, eq(charges.companyId, companies.id))
    .leftJoin(invoices, eq(invoices.chargeId, charges.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(charges.createdAt));

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    valueCents: r.valueCents,
    billingType: r.billingType,
    dueDate: r.dueDate,
    status: r.status,
    invoiceUrl: r.invoiceUrl,
    paidAt: r.paidAt,
    createdAt: r.createdAt,
    quoteId: r.quoteId,
    company: { id: r.companyId, name: r.companyName },
    invoice:
      r.invoiceId && r.invoiceStatus
        ? {
            id: r.invoiceId,
            status: r.invoiceStatus,
            number: r.invoiceNumber,
            errorMessage: r.invoiceError,
          }
        : null,
  }));
}

export type InvoiceDownloadItem = {
  id: string;
  number: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  companyName: string;
  chargeDescription: string;
};

/**
 * Notas autorizadas (com PDF/XML do Asaas) dentro dos mesmos filtros da
 * lista de cobranças — base para o ZIP enviado à contabilidade.
 */
export async function listAuthorizedInvoices(
  user: SessionUser,
  filters: {
    status?: Charge["status"];
    companyId?: string;
    period?: PeriodRange;
    dateBase?: PeriodDateBase;
  } = {},
): Promise<InvoiceDownloadItem[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [eq(invoices.status, "authorized")];
  if (scope) conditions.push(inArray(charges.companyId, scope));
  if (filters.companyId) conditions.push(eq(charges.companyId, filters.companyId));
  if (filters.status) conditions.push(eq(charges.status, filters.status));
  if (filters.period) {
    conditions.push(...periodConditions(filters.period, filters.dateBase));
  }

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      pdfUrl: invoices.asaasPdfUrl,
      xmlUrl: invoices.asaasXmlUrl,
      companyName: companyName,
      chargeDescription: charges.description,
    })
    .from(invoices)
    .innerJoin(charges, eq(invoices.chargeId, charges.id))
    .innerJoin(companies, eq(charges.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(asc(charges.dueDate));

  return rows.filter((r) => r.pdfUrl ?? r.xmlUrl);
}

export type FinanceSummary = {
  openCents: number;
  openCount: number;
  overdueCount: number;
  receivedThisMonthCents: number;
};

/** Cards-resumo do topo da página financeira (escopo do usuário). */
export async function financeSummary(
  user: SessionUser,
): Promise<FinanceSummary> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) {
    return { openCents: 0, openCount: 0, overdueCount: 0, receivedThisMonthCents: 0 };
  }

  const scopeCondition: SQL = scope
    ? inArray(charges.companyId, scope)
    : sql`true`;

  const [open, overdue, received] = await Promise.all([
    db
      .select({
        cents: sql<number>`coalesce(sum(${charges.valueCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(charges)
      .where(and(scopeCondition, inArray(charges.status, ["pending", "overdue"]))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(charges)
      .where(and(scopeCondition, eq(charges.status, "overdue"))),
    db
      .select({ cents: sql<number>`coalesce(sum(${charges.valueCents}), 0)::int` })
      .from(charges)
      .where(
        and(
          scopeCondition,
          inArray(charges.status, ["received", "confirmed"]),
          sql`date_trunc('month', ${charges.paidAt} AT TIME ZONE 'America/Sao_Paulo') = ${SQL_THIS_MONTH}`,
        ),
      ),
  ]);

  return {
    openCents: open[0]?.cents ?? 0,
    openCount: open[0]?.count ?? 0,
    overdueCount: overdue[0]?.count ?? 0,
    receivedThisMonthCents: received[0]?.cents ?? 0,
  };
}

// ─────────────────────────── Catálogo de serviços ───────────────────────────

export type ServiceListItem = Service & {
  /** Ids dos usuários da equipe vinculados ao serviço. */
  memberUserIds: string[];
};

/**
 * Catálogo completo (gestão) — só equipe. Inclui os ids dos membros
 * vinculados a cada serviço (service_team_members).
 */
export async function listServices(
  user: SessionUser,
): Promise<ServiceListItem[]> {
  requireTeam(user);

  const [rows, memberRows] = await Promise.all([
    db.select().from(services).orderBy(asc(services.name)),
    db
      .select({
        serviceId: serviceTeamMembers.serviceId,
        userId: serviceTeamMembers.userId,
      })
      .from(serviceTeamMembers),
  ]);

  const memberIdsByService = new Map<string, string[]>();
  for (const member of memberRows) {
    const ids = memberIdsByService.get(member.serviceId);
    if (ids) ids.push(member.userId);
    else memberIdsByService.set(member.serviceId, [member.userId]);
  }

  return rows.map((service) => ({
    ...service,
    memberUserIds: memberIdsByService.get(service.id) ?? [],
  }));
}

/** Serviços ativos do catálogo (select de ativação). */
export async function listActiveServices(user: SessionUser): Promise<Service[]> {
  requireTeam(user);
  return db
    .select()
    .from(services)
    .where(eq(services.active, true))
    .orderBy(asc(services.name));
}

export type CompanyServiceItem = {
  id: string;
  status: CompanyService["status"];
  valueCents: number;
  billingType: CompanyService["billingType"];
  createdAt: Date;
  service: { id: string; name: string; billing: Service["billing"]; cycle: Service["cycle"] };
  company: { id: string; name: string };
};

/** Serviços ativados por empresa (assinaturas e avulsos), filtrável por empresa. */
export async function listCompanyServices(
  user: SessionUser,
  filters: { companyId?: string } = {},
): Promise<CompanyServiceItem[]> {
  requireTeam(user);
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(companyServices.companyId, scope));
  if (filters.companyId)
    conditions.push(eq(companyServices.companyId, filters.companyId));

  const rows = await db
    .select({
      id: companyServices.id,
      status: companyServices.status,
      valueCents: companyServices.valueCents,
      billingType: companyServices.billingType,
      createdAt: companyServices.createdAt,
      serviceId: services.id,
      serviceName: services.name,
      serviceBilling: services.billing,
      serviceCycle: services.cycle,
      companyId: companies.id,
      companyName: companyName,
    })
    .from(companyServices)
    .innerJoin(services, eq(companyServices.serviceId, services.id))
    .innerJoin(companies, eq(companyServices.companyId, companies.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(companyServices.createdAt));

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    valueCents: r.valueCents,
    billingType: r.billingType,
    createdAt: r.createdAt,
    service: {
      id: r.serviceId,
      name: r.serviceName,
      billing: r.serviceBilling,
      cycle: r.serviceCycle,
    },
    company: { id: r.companyId, name: r.companyName },
  }));
}

/** Cobrança vinculada a um orçamento (para o detalhe do orçamento). */
export async function getChargeByQuoteId(
  quoteId: string,
): Promise<{ id: string; status: Charge["status"]; valueCents: number } | null> {
  const [row] = await db
    .select({
      id: charges.id,
      status: charges.status,
      valueCents: charges.valueCents,
    })
    .from(charges)
    .where(eq(charges.quoteId, quoteId))
    .limit(1);
  return row ?? null;
}
