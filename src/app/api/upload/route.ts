import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  ALLOWED_MIME_TYPES,
  buildFileKey,
  getStorage,
  MAX_UPLOAD_SIZE,
} from "@/lib/storage";

/**
 * POST /api/upload — multipart/form-data com campo `file`.
 * Autenticado (qualquer role). Retorna os metadados para vincular
 * em um attachment via action (taskId/projectId/demandId).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Arquivo não enviado (campo `file`)." },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json(
      { error: "Arquivo excede o limite de 50 MB." },
      { status: 413 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Tipo de arquivo não permitido: ${mimeType}` },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildFileKey(file.name);
  const stored = await getStorage().put(key, buffer, mimeType);

  return NextResponse.json({
    fileKey: stored.fileKey,
    publicUrl: stored.publicUrl,
    fileName: file.name,
    fileSize: file.size,
    mimeType,
  });
}
