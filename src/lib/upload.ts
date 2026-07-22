/**
 * Helper client-side de upload: escolhe o fluxo conforme o driver ativo
 * (GET /api/upload) e retorna os metadados para vincular via action.
 *
 * - Driver "blob" (produção): upload direto do navegador para o Vercel Blob,
 *   sem passar pelo corpo da função serverless (limite de ~4,5 MB na Vercel).
 * - Driver "local" (dev): multipart para POST /api/upload (disco em ./.storage).
 */
import { upload } from "@vercel/blob/client";

import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE,
  sanitizeFileName,
} from "@/lib/storage/constants";

export type UploadedFileMeta = {
  fileKey: string;
  publicUrl?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/** Envia um arquivo e retorna os metadados. Lança Error com mensagem amigável. */
export async function uploadFile(file: File): Promise<UploadedFileMeta> {
  const mimeType = file.type || "application/octet-stream";
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error("Arquivo excede o limite de 50 MB.");
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Tipo de arquivo não permitido: ${mimeType}`);
  }

  const driverResponse = await fetch("/api/upload");
  const { driver } = (await driverResponse.json().catch(() => ({}))) as {
    driver?: string;
  };

  if (driver === "blob") {
    const blob = await upload(sanitizeFileName(file.name) || "arquivo", file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType: mimeType,
    });
    return {
      fileKey: blob.url,
      publicUrl: blob.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
    };
  }

  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ error?: string } & Partial<UploadedFileMeta>)
    | null;
  if (!response.ok || !payload?.fileKey) {
    throw new Error(payload?.error ?? "Não foi possível enviar o arquivo.");
  }
  return {
    fileKey: payload.fileKey,
    publicUrl: payload.publicUrl,
    fileName: payload.fileName ?? file.name,
    fileSize: payload.fileSize ?? file.size,
    mimeType: payload.mimeType ?? mimeType,
  };
}
