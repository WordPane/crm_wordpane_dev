/**
 * Migra anexos do Vercel Blob para S3/MinIO.
 *
 * - Lê todos os registros da tabela `attachments` cujo `fileKey` parece uma URL
 *   do Vercel Blob (https://*.public.blob.vercel-storage.com/...).
 * - Baixa o arquivo.
 * - Envia para o S3 configurado (S3_ENDPOINT, S3_BUCKET, etc.).
 * - Atualiza o `fileKey` do registro para `s3://bucket/key`.
 *
 * Uso:
 *   BLOB_READ_WRITE_TOKEN=xxx S3_ENDPOINT=xxx S3_BUCKET=xxx \
 *   S3_ACCESS_KEY=xxx S3_SECRET_KEY=xxx DATABASE_URL=xxx \
 *   npx tsx scripts/migrate-blob-to-s3.ts
 */

import { list } from "@vercel/blob";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { s3Driver } from "@/lib/storage/s3";

const BLOB_HOST = "blob.vercel-storage.com";

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN não configurado.");
  }

  // Lista todos os blobs paginados
  const blobs: { url: string; pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, token });
    blobs.push(...page.blobs);
    cursor = page.cursor ?? undefined;
  } while (cursor);

  console.log(`Total de blobs encontrados: ${blobs.length}`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const blob of blobs) {
    // Procura o attachment pelo fileKey exato
    const [attachment] = await db
      .select({ id: attachments.id, fileKey: attachments.fileKey })
      .from(attachments)
      .where(eq(attachments.fileKey, blob.url))
      .limit(1);

    if (!attachment) {
      console.warn(`Nenhum attachment encontrado para ${blob.url}`);
      skipped++;
      continue;
    }

    try {
      const response = await fetch(blob.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const key = blob.pathname;

      const stored = await s3Driver.put(key, buffer, "application/octet-stream");

      await db
        .update(attachments)
        .set({ fileKey: stored.fileKey })
        .where(eq(attachments.id, attachment.id));

      console.log(`Migrado: ${blob.url} -> ${stored.fileKey}`);
      migrated++;
    } catch (error) {
      console.error(`Falha ao migrar ${blob.url}:`, error);
      failed++;
    }
  }

  // Também cobre anexos cuja URL pode estar em outro formato (ex.: sem https)
  const remaining = await db
    .select({ id: attachments.id, fileKey: attachments.fileKey })
    .from(attachments)
    .where(eq(attachments.fileKey, `https://${BLOB_HOST}`));

  console.log("\nResumo:");
  console.log(`  Migrados: ${migrated}`);
  console.log(`  Pulados:  ${skipped}`);
  console.log(`  Falhas:   ${failed}`);
  console.log(`  Restantes com host ${BLOB_HOST}: ${remaining.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
