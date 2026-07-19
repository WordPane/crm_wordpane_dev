import { db } from "@/lib/db";
import { activities } from "@/lib/db/schema";

export type LogActivityInput = {
  /** Null quando a ação partiu de um link público (sem usuário autenticado). */
  actorId: string | null;
  companyId?: string | null;
  projectId?: string | null;
  /** project | milestone | task | comment | attachment | demand | link | company | member */
  entityType: string;
  entityId?: string | null;
  /** ex.: project.created, task.status_changed */
  action: string;
  metadata?: Record<string, unknown>;
};

/** Registra um evento na timeline/histórico. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  await db.insert(activities).values({
    actorId: input.actorId,
    companyId: input.companyId ?? null,
    projectId: input.projectId ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    metadata: input.metadata ?? null,
  });
}
