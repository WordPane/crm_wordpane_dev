import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

/**
 * Dados do emissor (a própria WordPane) exibidos em documentos gerados
 * pelo CRM — hoje o PDF do orçamento. Valores padrão abaixo podem ser
 * sobrescritos em Admin → Configurações (app_settings["issuer.info"]).
 */

export const ISSUER_SETTINGS_KEY = "issuer.info";

export type IssuerInfo = {
  displayName: string;
  razaoSocial: string;
  cnpj: string;
  email: string;
  phone: string;
  /** Endereço completo em linha única. */
  addressLine: string;
  /** Código do serviço municipal para NFS-e (LC 116/2003). */
  serviceCode: string;
  /** Nome do serviço exibido na NFS-e. */
  serviceName: string;
};

/** Dados cadastrais da WordPane (fallback quando nada foi salvo ainda). */
export const DEFAULT_ISSUER: IssuerInfo = {
  displayName: "WordPane",
  razaoSocial: "WordPane Administração de Sistemas Ltda",
  cnpj: "40.904.977/0001-58",
  email: "hello@wordpane.dev",
  phone: "(51) 99306-0845",
  addressLine:
    "Dr José Bento Corrêa, 545, 727 — Morro Santana, Porto Alegre/RS — CEP 91450-030",
  serviceCode: "01.01",
  serviceName: "Análise e desenvolvimento de sistemas",
};

const CACHE_TTL_MS = 60_000;
let cache: { value: IssuerInfo; expiresAt: number } | null = null;

export function invalidateIssuerCache(): void {
  cache = null;
}

/** Lê os dados do emissor (override de app_settings ou padrão). */
export async function getIssuer(): Promise<IssuerInfo> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let value = DEFAULT_ISSUER;
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, ISSUER_SETTINGS_KEY))
    .limit(1);
  if (row) {
    try {
      value = { ...DEFAULT_ISSUER, ...(row.value as Partial<IssuerInfo>) };
    } catch {
      value = DEFAULT_ISSUER;
    }
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/** Grava os dados do emissor (edição em Configurações). */
export async function updateIssuer(input: IssuerInfo): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: ISSUER_SETTINGS_KEY, value: input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: input, updatedAt: new Date() },
    });

  invalidateIssuerCache();
}
