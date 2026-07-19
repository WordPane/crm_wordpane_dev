import { eq } from "drizzle-orm";

import {
  DEFAULT_BRAND,
  type BrandConfig,
} from "@/lib/brand/config";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";

/**
 * Identidade visual da instância (white-label): nome, logo, favicon e cores.
 * Personalizável em Admin → Configurações (app_settings["brand.config"]).
 * O padrão é a marca WordPane — instâncias sem configuração ficam inalteradas.
 */

export const BRAND_SETTINGS_KEY = "brand.config";

const CACHE_TTL_MS = 60_000;
let cache: { value: BrandConfig; expiresAt: number } | null = null;

export function invalidateBrandCache(): void {
  cache = null;
}

/** Lê a configuração de marca (override de app_settings ou padrão). */
export async function getBranding(): Promise<BrandConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let value = DEFAULT_BRAND;
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, BRAND_SETTINGS_KEY))
    .limit(1);
  if (row) {
    try {
      value = { ...DEFAULT_BRAND, ...(row.value as Partial<BrandConfig>) };
    } catch {
      value = DEFAULT_BRAND;
    }
  }

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

/** Grava a configuração de marca (edição em Configurações). */
export async function updateBranding(input: BrandConfig): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: BRAND_SETTINGS_KEY, value: input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: input, updatedAt: new Date() },
    });

  invalidateBrandCache();
}
