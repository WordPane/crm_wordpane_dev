/**
 * Abstração de storage de arquivos.
 *
 * - Dev: disco local em ./.storage (sem dependências externas)
 * - Produção (Dokploy): S3/MinIO (quando S3_ENDPOINT está definido)
 * - Produção (Vercel): Vercel Blob (quando BLOB_READ_WRITE_TOKEN está definido)
 *
 * Os metadados dos arquivos ficam na tabela `attachments` (Postgres);
 * aqui cuidamos apenas dos bytes.
 */

export type StoredFile = {
  /** Chave/identificador do arquivo no driver (path local, URL do blob ou s3://bucket/key). */
  fileKey: string;
  /** URL pública (quando o driver expõe uma, ex.: blob). */
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
import { s3Driver } from "./s3";

/** Driver S3/MinIO ativo quando todas as variáveis obrigatórias estão definidas. */
export function usingS3Storage(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY,
  );
}

/** Driver blob ativo apenas com o token configurado (legado Vercel). */
export function usingBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getStorage(): StorageDriver {
  if (usingS3Storage()) return s3Driver;
  if (usingBlobStorage()) return blobDriver;
  return localDriver;
}

export { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE, sanitizeFileName };
