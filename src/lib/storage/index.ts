/**
 * Abstração de storage de arquivos.
 *
 * - Dev: disco local em ./.storage (sem dependências externas)
 * - Produção: Vercel Blob (quando BLOB_READ_WRITE_TOKEN está definido)
 *
 * Os metadados dos arquivos ficam na tabela `attachments` (Postgres);
 * aqui cuidamos apenas dos bytes.
 */

export type StoredFile = {
  /** Chave/identificador do arquivo no driver (path local ou URL do blob). */
  fileKey: string;
  /** URL pública (apenas driver blob). */
  publicUrl?: string;
};

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function buildFileKey(originalName: string): string {
  const safe = sanitizeFileName(originalName) || "arquivo";
  return `uploads/${crypto.randomUUID()}-${safe}`;
}

import { blobDriver } from "./blob";
import { localDriver } from "./local";

export function getStorage(): StorageDriver {
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobDriver;
  return localDriver;
}

export const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "video/mp4",
  "application/octet-stream", // PSD e outros binários
]);
