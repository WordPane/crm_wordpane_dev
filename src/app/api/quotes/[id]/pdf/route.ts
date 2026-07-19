import { readFileSync } from "node:fs";
import path from "node:path";

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
import { getIssuer } from "@/lib/issuer";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { formatQuoteNumber } from "@/lib/utils/format";

/** Logo oficial como data URI (cache em módulo — arquivo estático). */
let logoDataUri: string | null = null;
function getLogoDataUri(): string {
  if (!logoDataUri) {
    const buffer = readFileSync(
      path.join(process.cwd(), "public", "brand", "logo-white.png"),
    );
    logoDataUri = `data:image/png;base64,${buffer.toString("base64")}`;
  }
  return logoDataUri;
}

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
      companyPersonType: companies.personType,
      companyPhone: companies.telefone,
      companyLogradouro: companies.logradouro,
      companyNumero: companies.numero,
      companyComplemento: companies.complemento,
      companyBairro: companies.bairro,
      companyCidade: companies.cidade,
      companyEstado: companies.estado,
      companyCep: companies.cep,
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

  const addressParts = [
    [row.companyLogradouro, row.companyNumero]
      .filter(Boolean)
      .join(", ") || null,
    row.companyComplemento,
    row.companyBairro,
    [row.companyCidade, row.companyEstado].filter(Boolean).join("/") || null,
    row.companyCep ? `CEP ${row.companyCep}` : null,
  ].filter(Boolean);
  const companyAddress = addressParts.length
    ? addressParts.join(" — ")
    : null;

  const buffer = await renderQuotePdf({
    quote: row.quote,
    items,
    company: {
      name: row.companyName,
      cnpj: row.companyCnpj,
      email: row.companyEmail,
      personType: row.companyPersonType,
      address: companyAddress,
      phone: row.companyPhone,
    },
    issuer: await getIssuer(),
    logoSrc: getLogoDataUri(),
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
