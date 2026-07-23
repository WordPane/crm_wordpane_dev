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
import { getBranding } from "@/lib/brand/settings";
import type { BrandConfig } from "@/lib/brand/config";
import { db } from "@/lib/db";
import { companies, quoteItems, quotes } from "@/lib/db/schema";
import { getIssuer } from "@/lib/issuer";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { getStorage } from "@/lib/storage";
import { formatQuoteNumber } from "@/lib/utils/format";

/** Logo da marca como data URI (cache de 60s por valor de origem). */
let logoCache: { key: string; dataUri: string; expiresAt: number } | null = null;

function mimeFor(source: string): string {
  const ext = source.split(".").pop()?.toLowerCase() ?? "png";
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      svg: "image/svg+xml",
      webp: "image/webp",
    }[ext] ?? "image/png"
  );
}

async function getLogoDataUri(brand: BrandConfig): Promise<string> {
  const source = brand.logoUrl;
  if (
    logoCache &&
    logoCache.key === source &&
    logoCache.expiresAt > Date.now()
  ) {
    return logoCache.dataUri;
  }

  let dataUri: string;
  if (source.startsWith("/")) {
    // Asset estático em /public (marca padrão)
    const buffer = readFileSync(path.join(process.cwd(), "public", source));
    dataUri = `data:${mimeFor(source)};base64,${buffer.toString("base64")}`;
  } else if (/^https?:\/\//i.test(source)) {
    // URL pública (Vercel Blob)
    const response = await fetch(source);
    if (!response.ok) throw new Error("Não foi possível baixar a logo da marca.");
    const buffer = Buffer.from(await response.arrayBuffer());
    dataUri = `data:${response.headers.get("content-type") ?? "image/png"};base64,${buffer.toString("base64")}`;
  } else {
    // fileKey do storage local (dev)
    const buffer = await getStorage().get(source);
    if (!buffer) throw new Error("Logo da marca não encontrada no storage.");
    dataUri = `data:${mimeFor(source)};base64,${buffer.toString("base64")}`;
  }

  logoCache = { key: source, dataUri, expiresAt: Date.now() + 60_000 };
  return dataUri;
}

/**
 * GET /api/quotes/[id]/pdf — PDF do orçamento gerado na hora.
 * Inline por padrão (abre no navegador); `?download=1` força o download.
 * Autenticado: equipe com acesso à empresa, ou cliente da mesma empresa
 * (rascunho/solicitação nunca). Sem sessão: exige `?token=` igual ao token
 * público do link de aprovação (rascunho/solicitação nunca).
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
      // Cliente nunca vê rascunho nem solicitação — se comportam como inexistentes
      if (row.quote.status === "draft" || row.quote.status === "requested") {
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
    // Acesso pelo link público: token exato e não pode ser rascunho nem solicitação
    const token = new URL(request.url).searchParams.get("token");
    if (
      token !== row.quote.publicToken ||
      row.quote.status === "draft" ||
      row.quote.status === "requested"
    ) {
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

  const brand = await getBranding();
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
    logoSrc: await getLogoDataUri(brand),
    brand,
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
