"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireSuperAdmin, requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  projects,
  projectStatuses,
  tasks,
  taskStatuses,
} from "@/lib/db/schema";
import { statusFormSchema } from "@/lib/validations/settings";
import { actionError, type ActionResult } from "@/server/actions/utils";

export type StatusKind = "project" | "task";

const tables = {
  project: { statuses: projectStatuses, refs: projects, label: "projeto" },
  task: { statuses: taskStatuses, refs: tasks, label: "tarefa" },
} as const;

function revalidateSettings() {
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/projetos");
  revalidatePath("/admin/tarefas");
}

export async function createStatus(
  kind: StatusKind,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = statusFormSchema.parse(input);
    const t = tables[kind];

    const [max] = await db
      .select({ value: sql<number>`coalesce(max(${t.statuses.position}), -1)` })
      .from(t.statuses);

    await db.insert(t.statuses).values({
      name: data.name,
      color: data.color,
      isFinal: data.isFinal,
      active: data.active,
      position: max.value + 1,
    });

    revalidateSettings();
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe um status com este nome.",
    });
  }
}

export async function updateStatus(
  kind: StatusKind,
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = statusFormSchema.parse(input);
    const t = tables[kind];

    await db
      .update(t.statuses)
      .set({
        name: data.name,
        color: data.color,
        isFinal: data.isFinal,
        active: data.active,
      })
      .where(eq(t.statuses.id, id));

    revalidateSettings();
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe um status com este nome.",
    });
  }
}

export async function deleteStatus(
  kind: StatusKind,
  id: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const t = tables[kind];

    const [usage] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.refs)
      .where(eq(t.refs.statusId, id));

    if (usage.count > 0) {
      return {
        error: `Este status está em uso por ${usage.count} ${
          kind === "project" ? "projeto(s)" : "tarefa(s)"
        } e não pode ser excluído. Desative-o ou reatribua os itens antes.`,
      };
    }

    await db.delete(t.statuses).where(eq(t.statuses.id, id));

    revalidateSettings();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function moveStatus(
  kind: StatusKind,
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const t = tables[kind];

    const all = await db
      .select({ id: t.statuses.id, position: t.statuses.position })
      .from(t.statuses)
      .orderBy(asc(t.statuses.position), asc(t.statuses.name));

    const index = all.findIndex((s) => s.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= all.length) {
      return { success: true };
    }

    const current = all[index];
    const target = all[targetIndex];
    await db.transaction(async (tx) => {
      await tx
        .update(t.statuses)
        .set({ position: target.position })
        .where(eq(t.statuses.id, current.id));
      await tx
        .update(t.statuses)
        .set({ position: current.position })
        .where(eq(t.statuses.id, target.id));
    });

    revalidateSettings();
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
