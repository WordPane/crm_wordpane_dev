import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { StorageDriver, StoredFile } from "./index";

function getClient(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Configuração S3 incompleta: S3_ENDPOINT, S3_ACCESS_KEY e S3_SECRET_KEY são obrigatórios.",
    );
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET não configurado.");
  return bucket;
}

function buildFileKey(key: string): string {
  return `s3://${getBucket()}/${key}`;
}

function parseFileKey(fileKey: string): { bucket: string; key: string } {
  if (fileKey.startsWith("s3://")) {
    const rest = fileKey.slice(5);
    const idx = rest.indexOf("/");
    if (idx === -1) throw new Error(`Chave S3 inválida: ${fileKey}`);
    return { bucket: rest.slice(0, idx), key: rest.slice(idx + 1) };
  }
  // Compatibilidade com chaves legadas que não usam prefixo s3://
  return { bucket: getBucket(), key: fileKey };
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (error instanceof Error && error.name === "NotFound") {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } else {
      throw error;
    }
  }
}

export const s3Driver: StorageDriver = {
  async put(key, data, contentType): Promise<StoredFile> {
    const client = getClient();
    const bucket = getBucket();

    await ensureBucket(client, bucket);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );

    return { fileKey: buildFileKey(key) };
  },

  async get(fileKey): Promise<Buffer | null> {
    const client = getClient();
    const { bucket, key } = parseFileKey(fileKey);

    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!response.Body) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      // NoSuchKey
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      ) {
        return null;
      }
      throw error;
    }
  },

  async delete(fileKey): Promise<void> {
    const client = getClient();
    const { bucket, key } = parseFileKey(fileKey);

    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch {
      // arquivo inexistente — ok
    }
  },
};
