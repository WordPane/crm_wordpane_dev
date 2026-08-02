import { and, desc, eq } from "drizzle-orm";

import { requireUser, type SessionUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";

export type SavedViewFilters = Record<string, string | boolean | undefined>;

export type SavedViewItem = {
  id: string;
  name: string;
  entity: string;
  filters: SavedViewFilters;
};

/** Lista as visualizações salvas do usuário para uma entidade. */
export async function listSavedViews(
  user: SessionUser,
  entity: string,
): Promise<SavedViewItem[]> {
  return db
    .select({
      id: savedViews.id,
      name: savedViews.name,
      entity: savedViews.entity,
      filters: savedViews.filters,
    })
    .from(savedViews)
    .where(and(eq(savedViews.userId, user.id), eq(savedViews.entity, entity)))
    .orderBy(desc(savedViews.updatedAt))
    .then((rows) =>
      rows.map((r) => ({
        ...r,
        filters: (r.filters ?? {}) as SavedViewFilters,
      })),
    );
}

/** Busca uma visualização salva pelo id, garantindo que pertença ao usuário. */
export async function getSavedView(
  user: SessionUser,
  id: string,
): Promise<SavedViewItem | null> {
  const [row] = await db
    .select({
      id: savedViews.id,
      name: savedViews.name,
      entity: savedViews.entity,
      filters: savedViews.filters,
    })
    .from(savedViews)
    .where(and(eq(savedViews.userId, user.id), eq(savedViews.id, id)))
    .limit(1);
  return row
    ? { ...row, filters: (row.filters ?? {}) as SavedViewFilters }
    : null;
}

/** Recupera as visualizações do usuário logado (uso em server components). */
export async function listCurrentUserSavedViews(
  entity: string,
): Promise<SavedViewItem[]> {
  const user = await requireUser();
  return listSavedViews(user, entity);
}
