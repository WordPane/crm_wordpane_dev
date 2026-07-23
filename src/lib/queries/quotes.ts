import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import {
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  attachments,
  companies,
  projects,
  quoteItems,
  quotes,
  services,
  users,
  type Quote,
  type QuoteItem,
} from "@/lib/db/schema";

/**
 * Queries de orçamentos da área admin. Super admins veem tudo; admins
 * apenas os orçamentos das empresas atribuídas a eles.
 */

const companyName = sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`;

export type QuoteListItem = {
  id: string;
  number: number;
  version: number;
  title: string;
  status: Quote["status"];
  totalCents: number;
  validUntil: string | null;
  sentAt: Date | null;
  createdAt: Date;
  projectId: string | null;
  company: { id: string; name: string };
};

/** Lista de orçamentos (mais recentes primeiro), com filtro opcional. */
export async function listQuotes(
  user: SessionUser,
  filters: {
    status?: Quote["status"];
    companyId?: string;
  },
): Promise<QuoteListItem[]> {
  const scope = await visibleCompanyIds(user);
  if (scope && scope.length === 0) return [];

  const conditions: SQL[] = [];
  if (scope) conditions.push(inArray(quotes.companyId, scope));
  if (filters.status) conditions.push(eq(quotes.status, filters.status));
  if (filters.companyId) conditions.push(eq(quotes.companyId, filters.companyId));

  const rows = await db
    .select({
      id: quotes.id,
      number: quotes.number,
      version: quotes.version,
      title: quotes.title,
      status: quotes.status,
      totalCents: quotes.totalCents,
      validUntil: quotes.validUntil,
      sentAt: quotes.sentAt,
      createdAt: quotes.createdAt,
      projectId: quotes.projectId,
      companyId: companies.id,
      companyName: companyName,
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(quotes.number));

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    version: r.version,
    title: r.title,
    status: r.status,
    totalCents: r.totalCents,
    validUntil: r.validUntil,
    sentAt: r.sentAt,
    createdAt: r.createdAt,
    projectId: r.projectId,
    company: { id: r.companyId, name: r.companyName },
  }));
}

export type QuoteAttachmentItem = {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
};

export type QuoteDetail = {
  quote: Quote;
  items: QuoteItem[];
  company: { id: string; name: string; cnpj: string | null; email: string | null };
  creator: { id: string; name: string } | null;
  responder: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  /** Orçamento do qual este foi duplicado (linhagem de versões). */
  origin: { id: string; number: number } | null;
  /** Nome do serviço solicitado pelo cliente (null = orçamento criado pela equipe). */
  serviceName: string | null;
  /** Anexos enviados pelo cliente na solicitação. */
  attachments: QuoteAttachmentItem[];
};

/** Orçamento completo (itens, empresa, autor, quem respondeu, projeto gerado). */
export async function getQuoteById(id: string): Promise<QuoteDetail | null> {
  const responder = alias(users, "responder");
  const originQuote = alias(quotes, "origin_quote");

  const [row] = await db
    .select({
      quote: quotes,
      companyId: companies.id,
      companyName: companyName,
      companyCnpj: companies.cnpj,
      companyEmail: companies.email,
      creatorId: users.id,
      creatorName: users.name,
      responderId: responder.id,
      responderName: responder.name,
      projectId: projects.id,
      projectName: projects.name,
      originId: originQuote.id,
      originNumber: originQuote.number,
      serviceName: services.name,
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .leftJoin(users, eq(quotes.createdBy, users.id))
    .leftJoin(responder, eq(quotes.respondedBy, responder.id))
    .leftJoin(projects, eq(quotes.projectId, projects.id))
    .leftJoin(originQuote, eq(quotes.duplicatedFromId, originQuote.id))
    .leftJoin(services, eq(quotes.serviceId, services.id))
    .where(eq(quotes.id, id))
    .limit(1);

  if (!row) return null;

  const [items, quoteAttachments] = await Promise.all([
    db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, id))
      .orderBy(asc(quoteItems.position)),
    db
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        fileSize: attachments.fileSize,
        mimeType: attachments.mimeType,
        createdAt: attachments.createdAt,
      })
      .from(attachments)
      .where(eq(attachments.quoteId, id))
      .orderBy(asc(attachments.createdAt)),
  ]);

  return {
    quote: row.quote,
    items,
    company: {
      id: row.companyId,
      name: row.companyName,
      cnpj: row.companyCnpj,
      email: row.companyEmail,
    },
    creator: row.creatorId ? { id: row.creatorId, name: row.creatorName! } : null,
    responder: row.responderId
      ? { id: row.responderId, name: row.responderName! }
      : null,
    project:
      row.projectId && row.projectName
        ? { id: row.projectId, name: row.projectName }
        : null,
    origin:
      row.originId && row.originNumber !== null
        ? { id: row.originId, number: row.originNumber }
        : null,
    serviceName: row.serviceName,
    attachments: quoteAttachments,
  };
}

export type QuoteRequestableService = {
  id: string;
  name: string;
  description: string | null;
};

/**
 * Serviços que o cliente pode solicitar no portal (ativos com a flag
 * quoteRequestEnabled), em ordem alfabética. Sem guarda de auth: a página
 * do portal já exige sessão.
 */
export async function listQuoteRequestableServices(): Promise<
  QuoteRequestableService[]
> {
  return db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
    })
    .from(services)
    .where(
      and(eq(services.active, true), eq(services.quoteRequestEnabled, true)),
    )
    .orderBy(asc(services.name));
}

export type PublicQuote = {
  quote: Quote;
  items: QuoteItem[];
  company: { name: string; cnpj: string | null; email: string | null };
};

/**
 * Orçamento pelo token do link público — null quando o token é inválido,
 * não existe ou o orçamento ainda é rascunho/solicitação (a página responde
 * notFound: pedido sem itens/preços não é público).
 */
export async function getQuoteByToken(
  token: string,
): Promise<PublicQuote | null> {
  if (!z.uuid().safeParse(token).success) return null;

  const [row] = await db
    .select({
      quote: quotes,
      companyName: companyName,
      companyCnpj: companies.cnpj,
      companyEmail: companies.email,
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .where(
      and(
        eq(quotes.publicToken, token),
        ne(quotes.status, "draft"),
        ne(quotes.status, "requested"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, row.quote.id))
    .orderBy(asc(quoteItems.position));

  return {
    quote: row.quote,
    items,
    company: {
      name: row.companyName,
      cnpj: row.companyCnpj,
      email: row.companyEmail,
    },
  };
}
