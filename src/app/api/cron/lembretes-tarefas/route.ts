import { and, between, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { SQL_TODAY, SQL_TOMORROW } from "@/lib/db/business-date";
import { projects, tasks } from "@/lib/db/schema";
import { notifyTaskDueSoon, notifyTaskOverdue } from "@/lib/notifications";
import { formatDate } from "@/lib/utils/format";

/**
 * GET /api/cron/lembretes-tarefas — lembrete diário de prazos de tarefas.
 * Dispara 1x ao dia (configurar no vercel.json).
 * Protegido pelo header Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // Tarefas abertas com prazo definido, sem lembrete hoje
  const baseConditions = and(
    isNull(tasks.completedAt),
    isNotNull(tasks.dueDate),
    or(
      isNull(tasks.lastReminderAt),
      sql`${tasks.lastReminderAt} AT TIME ZONE 'America/Sao_Paulo' < ${SQL_TODAY}`,
    ),
  )!;

  const [dueSoonRows, overdueRows] = await Promise.all([
    db
      .select({
        taskId: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        ownerId: tasks.ownerId,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          baseConditions,
          between(tasks.dueDate, SQL_TODAY, SQL_TOMORROW),
        )!,
      )
      .limit(100),
    db
      .select({
        taskId: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        ownerId: tasks.ownerId,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(baseConditions, lt(tasks.dueDate, SQL_TODAY))!)
      .limit(100),
  ]);

  let sent = 0;
  const now = new Date();

  for (const row of dueSoonRows) {
    if (!row.ownerId) continue;
    try {
      await notifyTaskDueSoon({
        userId: row.ownerId,
        taskId: row.taskId,
        taskTitle: row.title,
        projectId: row.projectId,
        projectName: row.projectName,
        dueDate: formatDate(row.dueDate),
      });
      await db
        .update(tasks)
        .set({ lastReminderAt: now })
        .where(eq(tasks.id, row.taskId));
      sent += 1;
    } catch (error) {
      console.error(`Falha no lembrete da tarefa ${row.taskId}:`, error);
    }
  }

  for (const row of overdueRows) {
    if (!row.ownerId) continue;
    try {
      await notifyTaskOverdue({
        userId: row.ownerId,
        taskId: row.taskId,
        taskTitle: row.title,
        projectId: row.projectId,
        projectName: row.projectName,
        dueDate: formatDate(row.dueDate),
      });
      await db
        .update(tasks)
        .set({ lastReminderAt: now })
        .where(eq(tasks.id, row.taskId));
      sent += 1;
    } catch (error) {
      console.error(`Falha no lembrete da tarefa ${row.taskId}:`, error);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    dueSoon: dueSoonRows.length,
    overdue: overdueRows.length,
  });
}
