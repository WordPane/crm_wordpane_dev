import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  assertCompanyAccess,
  ForbiddenError,
  requireUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { attachments, demands, projects, tasks } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

/** Empresa dona do anexo: via tarefa→projeto, projeto ou demanda. */
async function resolveOwnerCompanyId(attachment: {
  taskId: string | null;
  projectId: string | null;
  demandId: string | null;
}): Promise<string | null> {
  if (attachment.taskId) {
    const [row] = await db
      .select({ companyId: projects.companyId })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, attachment.taskId))
      .limit(1);
    return row?.companyId ?? null;
  }
  if (attachment.projectId) {
    const [row] = await db
      .select({ companyId: projects.companyId })
      .from(projects)
      .where(eq(projects.id, attachment.projectId))
      .limit(1);
    return row?.companyId ?? null;
  }
  if (attachment.demandId) {
    const [row] = await db
      .select({ companyId: demands.companyId })
      .from(demands)
      .where(eq(demands.id, attachment.demandId))
      .limit(1);
    return row?.companyId ?? null;
  }
  return null;
}

/**
 * GET /api/files/[id] — download autenticado de um anexo.
 * Blob (fileKey é URL pública) → redirect; disco local → stream com
 * Content-Disposition attachment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  if (!attachment) {
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );
  }

  const companyId = await resolveOwnerCompanyId(attachment);
  if (!companyId) {
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );
  }

  try {
    await assertCompanyAccess(user, companyId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  // Driver blob: fileKey é a URL pública
  if (/^https?:\/\//i.test(attachment.fileKey)) {
    return NextResponse.redirect(attachment.fileKey);
  }

  const buffer = await getStorage().get(attachment.fileKey);
  if (!buffer) {
    return NextResponse.json(
      { error: "Arquivo não encontrado no armazenamento." },
      { status: 404 },
    );
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
