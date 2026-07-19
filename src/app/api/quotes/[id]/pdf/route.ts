import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  assertCompanyAccess,
  ForbiddenError,
  getSessionUser,
  isTeam,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { companies, quoteItems, quotes } from "@/lib/db/schema";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { formatQuoteNumber } from "@/lib/utils/format";

/**
 * GET /api/quotes/[id]/pdf — PDF do orçamento gerado na hora.
 * Inline por padrão (abre no navegador); `?download=1` força o download.
 * Autenticado: equipe com acesso à empresa, ou cliente da mesma empresa
 * (rascunho nunca). Sem sessão: exige `?token=` igual ao token público
 * do link de aprovação (rascunho nunca).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [row] = await db
    .select({
      quote: quotes,
      companyName: sql<string>`coalesce(${companies.nomeFantasia}, ${companies.razaoSocial})`,
      companyCnpj: companies.cnpj,
      companyEmail: companies.email,
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .where(eq(quotes.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "Orçamento não encontrado." },
      { status: 404 },
    );
  }

  const user = await getSessionUser();

  if (user) {
    if (isTeam(user.role)) {
      try {
        await assertCompanyAccess(user, row.quote.companyId);
      } catch (error) {
        if (error instanceof ForbiddenError) {
          return NextResponse.json({ error: error.message }, { status: 403 });
        }
        throw error;
      }
    } else if (user.role === "client" && user.companyId === row.quote.companyId) {
      // Cliente nunca vê rascunho — se comporta como inexistente
      if (row.quote.status === "draft") {
        return NextResponse.json(
          { error: "Orçamento não encontrado." },
          { status: 404 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Você não tem permissão para esta ação." },
        { status: 403 },
      );
    }
  } else {
    // Acesso pelo link público: token precisa ser exato e não pode ser rascunho
    const token = new URL(request.url).searchParams.get("token");
    if (token !== row.quote.publicToken || row.quote.status === "draft") {
      return NextResponse.json(
        { error: "Orçamento não encontrado." },
        { status: 404 },
      );
    }
  }

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, id))
    .orderBy(asc(quoteItems.position));

  const buffer = await renderQuotePdf({
    quote: row.quote,
    items,
    company: {
      name: row.companyName,
      cnpj: row.companyCnpj,
      email: row.companyEmail,
    },
  });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `orcamento-${formatQuoteNumber(row.quote.number).toLowerCase()}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
