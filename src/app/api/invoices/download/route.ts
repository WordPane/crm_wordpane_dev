import { zipSync } from "fflate";
import { NextResponse } from "next/server";

import { getSessionUser, isTeam } from "@/lib/access/permissions";
import type { Charge } from "@/lib/db/schema";
import { listAuthorizedInvoices } from "@/lib/queries/finance";
import { parsePeriod } from "@/lib/utils/period";
import { chargeStatuses } from "@/lib/validations/finance";

const FORMATS = ["pdf", "xml", "ambos"] as const;
type DownloadFormat = (typeof FORMATS)[number];

/**
 * GET /api/invoices/download?periodo=&empresa=&status=&formato=
 * ZIP com as notas fiscais autorizadas dentro dos filtros da tela
 * (para envio à contabilidade). Somente equipe, escopo por empresa.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!isTeam(user.role)) {
    return NextResponse.json(
      { error: "Você não tem permissão para esta ação." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status")?.trim() ?? "";
  const status = (chargeStatuses as readonly string[]).includes(statusParam)
    ? (statusParam as Charge["status"])
    : undefined;
  const companyId = url.searchParams.get("empresa")?.trim() || undefined;
  const period = parsePeriod(url.searchParams.get("periodo")?.trim());
  const dateBase =
    url.searchParams.get("base")?.trim() === "pagamento"
      ? ("pagamento" as const)
      : ("vencimento" as const);
  const formatParam = url.searchParams.get("formato")?.trim() ?? "ambos";
  const format: DownloadFormat = (FORMATS as readonly string[]).includes(
    formatParam,
  )
    ? (formatParam as DownloadFormat)
    : "ambos";

  const items = await listAuthorizedInvoices(user, {
    status,
    companyId,
    period: period ?? undefined,
    dateBase,
  });
  if (items.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma nota autorizada encontrada nos filtros selecionados." },
      { status: 404 },
    );
  }

  const files: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  for (const item of items) {
    const base = sanitizeFileName(
      `NF-${item.number ?? item.id}-${item.companyName}`,
    );
    if ((format === "pdf" || format === "ambos") && item.pdfUrl) {
      const content = await fetchFile(item.pdfUrl);
      if (content) files[uniqueName(`${base}.pdf`, usedNames)] = content;
    }
    if ((format === "xml" || format === "ambos") && item.xmlUrl) {
      const content = await fetchFile(item.xmlUrl);
      if (content) files[uniqueName(`${base}.xml`, usedNames)] = content;
    }
  }

  if (Object.keys(files).length === 0) {
    return NextResponse.json(
      { error: "Arquivos das notas indisponíveis no momento." },
      { status: 502 },
    );
  }

  // PDFs e XMLs já são comprimidos — store (level 0) é mais rápido
  const zip = zipSync(files, { level: 0 });
  const fileName = `notas-fiscais${period ? `-${period.from.slice(0, 7)}` : ""}.zip`;
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function fetchFile(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.error(`Falha ao baixar arquivo da nota (${url}):`, error);
    return null;
  }
}

/** Nome de arquivo seguro: sem acentos e apenas [a-zA-Z0-9._-]. */
function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Evita colisão de nomes dentro do ZIP (sufixo -2, -3...). */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  let candidate = `${stem}-${i}${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${stem}-${i}${ext}`;
  }
  used.add(candidate);
  return candidate;
}
