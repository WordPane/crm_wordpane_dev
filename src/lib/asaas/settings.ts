import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/email/crypto";

/** Chave única em app_settings para a configuração do Asaas. */
export const ASAAS_SETTINGS_KEY = "asaas.config";

/** Configuração Asaas com a API key já descriptografada (só existe no servidor). */
export type AsaasSettings = {
  apiKey: string;
  environment: "sandbox" | "production";
  /** Token estático validado no header `asaas-access-token` do webhook. */
  webhookToken: string;
};

/** Versão segura para a UI: nunca expõe a API key. */
export type MaskedAsaasSettings = Omit<AsaasSettings, "apiKey"> & {
  hasApiKey: boolean;
};

/** Shape gravado no jsonb (API key criptografada). */
type StoredAsaasSettings = {
  apiKey: string;
  environment: "sandbox" | "production";
  webhookToken: string;
};

// Cache em memória de módulo (60s), mesmo padrão das configurações de e-mail
const CACHE_TTL_MS = 60_000;
let cache: { value: AsaasSettings | null; expiresAt: number } | null = null;

export function invalidateAsaasSettingsCache(): void {
  cache = null;
}

/** Lê a configuração do Asaas (descriptografando a API key). Null quando não configurada. */
export async function getAsaasSettings(): Promise<AsaasSettings | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, ASAAS_SETTINGS_KEY))
    .limit(1);

  let value: AsaasSettings | null = null;
  if (row) {
    try {
      const stored = row.value as StoredAsaasSettings;
      value = {
        environment: stored.environment,
        webhookToken: stored.webhookToken,
        apiKey: decryptSecret(stored.apiKey),
      };
    } catch (error) {
      console.error("Configuração do Asaas ilegível (chave mudou?):", error);
      value = null;
    }
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/**
 * Grava a configuração do Asaas. API key vazia mantém a atual;
 * webhookToken é gerado automaticamente na primeira gravação.
 */
export async function updateAsaasSettings(input: {
  environment: "sandbox" | "production";
  apiKey?: string;
}): Promise<void> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, ASAAS_SETTINGS_KEY))
    .limit(1);
  const current = row?.value as Partial<StoredAsaasSettings> | undefined;

  let storedApiKey: string;
  if (input.apiKey?.trim()) {
    storedApiKey = encryptSecret(input.apiKey.trim());
  } else if (current?.apiKey) {
    storedApiKey = current.apiKey;
  } else {
    throw new Error("Informe a API key do Asaas.");
  }

  const value: StoredAsaasSettings = {
    apiKey: storedApiKey,
    environment: input.environment,
    webhookToken: current?.webhookToken ?? crypto.randomUUID(),
  };

  await db
    .insert(appSettings)
    .values({ key: ASAAS_SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  invalidateAsaasSettingsCache();
}

/** Configuração atual sem a API key — para pré-preencher o formulário da UI. */
export async function getMaskedAsaasSettings(): Promise<MaskedAsaasSettings | null> {
  const settings = await getAsaasSettings();
  if (!settings) return null;
  return {
    environment: settings.environment,
    webhookToken: settings.webhookToken,
    hasApiKey: settings.apiKey.length > 0,
  };
}
