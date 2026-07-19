import { count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Estado de bootstrap da instância: o wizard /setup só fica disponível
 * enquanto não existe nenhum super admin cadastrado.
 */

const CACHE_TTL_MS = 30_000;
let cache: { value: boolean; expiresAt: number } | null = null;

export function invalidateSetupCache(): void {
  cache = null;
}

/** Existe ao menos um super admin? (gate do wizard /setup) */
export async function hasSuperAdmin(): Promise<boolean> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const [row] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, "super_admin"));

  const value = (row?.value ?? 0) > 0;
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
