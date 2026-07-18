import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Criptografia simétrica (AES-256-GCM) para segredos gravados no banco —
 * hoje apenas a senha do SMTP. A chave deriva de AUTH_SECRET (SHA-256),
 * então trocar AUTH_SECRET invalida os segredos já gravados.
 * Formato armazenado: `iv:tag:cipher` (cada parte em base64).
 */

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(process.env.AUTH_SECRET ?? "fallback-dev-secret")
    .digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12); // IV de 12 bytes: tamanho recomendado para GCM
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split(":");
  if (!iv || !tag || !data) {
    throw new Error("Segredo armazenado em formato inválido.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
