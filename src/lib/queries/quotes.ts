import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import {
  visibleCompanyIds,
  type SessionUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  companies,
  projects,
  quoteItems,
  quotes,
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

export type QuoteDetail = {
  quote: Quote;
  items: QuoteItem[];
  company: { id: string; name: string; cnpj: string | null; email: string | null };
  creator: { id: string; name: string } | null;
  responder: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  /** Orçamento do qual este foi duplicado (linhagem de versões). */
  origin: { id: string; number: number } | null;
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
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .leftJoin(users, eq(quotes.createdBy, users.id))
    .leftJoin(responder, eq(quotes.respondedBy, responder.id))
    .leftJoin(projects, eq(quotes.projectId, projects.id))
    .leftJoin(originQuote, eq(quotes.duplicatedFromId, originQuote.id))
    .where(eq(quotes.id, id))
    .limit(1);

  if (!row) return null;

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, id))
    .orderBy(asc(quoteItems.position));

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
  };
}

export type PublicQuote = {
  quote: Quote;
  items: QuoteItem[];
  company: { name: string; cnpj: string | null; email: string | null };
};

/**
 * Orçamento pelo token do link público — null quando o token é inválido,
 * não existe ou o orçamento ainda é rascunho (a página responde notFound).
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
    .where(and(eq(quotes.publicToken, token), ne(quotes.status, "draft")))
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
