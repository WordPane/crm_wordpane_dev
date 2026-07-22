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

export function buildFileKey(originalName: string): string {
  const safe = sanitizeFileName(originalName) || "arquivo";
  return `uploads/${crypto.randomUUID()}-${safe}`;
}

import { blobDriver } from "./blob";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE,
  sanitizeFileName,
} from "./constants";
import { localDriver } from "./local";

/** Driver blob ativo apenas com o token configurado (produção). */
export function usingBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getStorage(): StorageDriver {
  if (usingBlobStorage()) return blobDriver;
  return localDriver;
}

export { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE, sanitizeFileName };
