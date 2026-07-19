import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  assertCompanyAccess,
  ForbiddenError,
  getSessionUser,
  isTeam,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { charges, invoices } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

/**
 * GET /api/invoices/[id]/pdf — PDF da nota fiscal (storage interno).
 * Equipe com acesso à empresa ou cliente da mesma empresa.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .select({ invoice: invoices, companyId: charges.companyId })
    .from(invoices)
    .innerJoin(charges, eq(invoices.chargeId, charges.id))
    .where(eq(invoices.id, id))
    .limit(1);
  if (!row) {
    return NextResponse.json(
      { error: "Nota fiscal não encontrada." },
      { status: 404 },
    );
  }

  if (isTeam(user.role)) {
    try {
      await assertCompanyAccess(user, row.companyId);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }
  } else if (user.role !== "client" || user.companyId !== row.companyId) {
    return NextResponse.json(
      { error: "Você não tem permissão para esta ação." },
      { status: 403 },
    );
  }

  // Fallback: ainda não baixamos o arquivo — redireciona para a URL do Asaas
  if (!row.invoice.pdfKey) {
    if (row.invoice.asaasPdfUrl) {
      return NextResponse.redirect(row.invoice.asaasPdfUrl);
    }
    return NextResponse.json(
      { error: "PDF da nota ainda não disponível." },
      { status: 404 },
    );
  }

  const buffer = await getStorage().get(row.invoice.pdfKey);
  if (!buffer) {
    return NextResponse.json(
      { error: "Arquivo não encontrado no armazenamento." },
      { status: 404 },
    );
  }

  const filename = `nota-fiscal-${row.invoice.number ?? row.invoice.id}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
