import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  ALLOWED_MIME_TYPES,
  buildFileKey,
  getStorage,
  MAX_UPLOAD_SIZE,
  usingBlobStorage,
} from "@/lib/storage";

const BLOB_MISSING_ERROR =
  "Vercel Blob não configurado: crie um Blob Store no painel da Vercel e conecte-o ao projeto (BLOB_READ_WRITE_TOKEN ausente).";

/**
 * GET /api/upload — informa o driver ativo para o cliente escolher o fluxo:
 * "blob" (upload direto do navegador) ou "local" (multipart nesta rota).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  return NextResponse.json({ driver: usingBlobStorage() ? "blob" : "local" });
}

/**
 * POST /api/upload
 * - JSON (driver blob): gera o client token do upload direto — o arquivo
 *   vai do navegador ao Blob sem passar pelo corpo da função (que na Vercel
 *   tem limite de ~4,5 MB, muito abaixo do MAX_UPLOAD_SIZE).
 * - multipart/form-data com campo `file` (dev local): grava no storage e
 *   retorna os metadados para vincular em um attachment via action.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return handleClientToken(request);
  }
  return handleMultipart(request);
}

/** Upload direto ao Blob: emite o client token com as mesmas validações. */
async function handleClientToken(request: Request) {
  if (!usingBlobStorage()) {
    return NextResponse.json({ error: BLOB_MISSING_ERROR }, { status: 500 });
  }

  const body = (await request
    .json()
    .catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400 },
    );
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...ALLOWED_MIME_TYPES],
        maximumSizeInBytes: MAX_UPLOAD_SIZE,
        addRandomSuffix: true,
      }),
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível autorizar o upload.",
      },
      { status: 400 },
    );
  }
}

/** Dev local: recebe o arquivo via multipart e grava no driver ativo. */
async function handleMultipart(request: Request) {
  // Produção sem Blob: falha explícita em vez de erro de filesystem read-only.
  if (process.env.VERCEL && !usingBlobStorage()) {
    return NextResponse.json({ error: BLOB_MISSING_ERROR }, { status: 500 });
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
