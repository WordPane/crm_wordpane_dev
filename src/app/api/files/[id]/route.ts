import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  assertCompanyAccess,
  assertProjectAccess,
  ForbiddenError,
  requireUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { attachments, demands, projects, tasks } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

/** Dono do anexo (empresa + projeto quando houver): via tarefa→projeto, projeto ou demanda. */
async function resolveOwner(attachment: {
  taskId: string | null;
  projectId: string | null;
  demandId: string | null;
}): Promise<{ companyId: string; projectId: string | null } | null> {
  if (attachment.taskId) {
    const [row] = await db
      .select({ id: projects.id, companyId: projects.companyId })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.id, attachment.taskId))
      .limit(1);
    return row ? { companyId: row.companyId, projectId: row.id } : null;
  }
  if (attachment.projectId) {
    const [row] = await db
      .select({ companyId: projects.companyId })
      .from(projects)
      .where(eq(projects.id, attachment.projectId))
      .limit(1);
    return row
      ? { companyId: row.companyId, projectId: attachment.projectId }
      : null;
  }
  if (attachment.demandId) {
    const [row] = await db
      .select({ companyId: demands.companyId })
      .from(demands)
      .where(eq(demands.id, attachment.demandId))
      .limit(1);
    return row ? { companyId: row.companyId, projectId: null } : null;
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

  const owner = await resolveOwner(attachment);
  if (!owner) {
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );
  }

  try {
    if (owner.projectId) {
      await assertProjectAccess(user, {
        id: owner.projectId,
        companyId: owner.companyId,
      });
    } else {
      await assertCompanyAccess(user, owner.companyId);
    }
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
