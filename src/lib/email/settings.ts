import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/email/crypto";
import { emailSettingsSchema } from "@/lib/validations/settings";

/** Chave única em app_settings para a configuração SMTP. */
export const EMAIL_SETTINGS_KEY = "email.smtp";

/** Configuração SMTP com a senha já descriptografada (só existe no servidor). */
export type EmailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  appUrl: string;
};

/** Versão segura para a UI: nunca expõe a senha. */
export type MaskedEmailSettings = Omit<EmailSettings, "password"> & {
  hasPassword: boolean;
};

/** Shape gravado no jsonb (senha criptografada). */
type StoredEmailSettings = Omit<EmailSettings, "password"> & {
  password: string;
};

// Cache em memória de módulo (60s) para não bater no banco a cada e-mail enviado
const CACHE_TTL_MS = 60_000;
let cache: { value: EmailSettings | null; expiresAt: number } | null = null;

export function invalidateEmailSettingsCache(): void {
  cache = null;
}

/**
 * Lê a configuração SMTP (descriptografando a senha).
 * Retorna null quando não configurada ou quando o registro está ilegível.
 */
export async function getEmailSettings(): Promise<EmailSettings | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, EMAIL_SETTINGS_KEY))
    .limit(1);

  let value: EmailSettings | null = null;
  if (row) {
    try {
      const stored = row.value as StoredEmailSettings;
      value = { ...stored, password: decryptSecret(stored.password) };
    } catch (error) {
      console.error("Configuração de e-mail ilegível (chave mudou?):", error);
      value = null;
    }
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/**
 * Grava a configuração SMTP (validação Zod incluída).
 * Senha vazia mantém a atual; preenchida, é recriptografada. Invalida o cache.
 */
export async function updateEmailSettings(input: unknown): Promise<void> {
  const data = emailSettingsSchema.parse(input);

  let storedPassword: string;
  if (data.password?.trim()) {
    storedPassword = encryptSecret(data.password.trim());
  } else {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, EMAIL_SETTINGS_KEY))
      .limit(1);
    const current = row?.value as Partial<StoredEmailSettings> | undefined;
    if (!current?.password) {
      throw new Error("Informe a senha do SMTP.");
    }
    storedPassword = current.password;
  }

  const value: StoredEmailSettings = {
    host: data.host,
    port: data.port,
    secure: data.secure,
    user: data.user,
    password: storedPassword,
    fromEmail: data.fromEmail,
    fromName: data.fromName,
    appUrl: data.appUrl.replace(/\/+$/, ""),
  };

  await db
    .insert(appSettings)
    .values({ key: EMAIL_SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  invalidateEmailSettingsCache();
}

/** Configuração atual sem a senha — para pré-preencher o formulário da UI. */
export async function getMaskedEmailSettings(): Promise<MaskedEmailSettings | null> {
  const settings = await getEmailSettings();
  if (!settings) return null;
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user,
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    appUrl: settings.appUrl,
    hasPassword: settings.password.length > 0,
  };
}
