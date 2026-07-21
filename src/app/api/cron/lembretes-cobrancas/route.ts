import { and, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { SQL_TODAY } from "@/lib/db/business-date";
import { charges } from "@/lib/db/schema";
import { notifyChargeReminder } from "@/lib/notifications";
import { businessToday } from "@/lib/utils/format";

/**
 * GET /api/cron/lembretes-cobrancas — lembrete diário de cobranças vencidas.
 * Disparado pelo Vercel Cron (vercel.json), 1x ao dia às 12:00 UTC (9h BRT).
 * Protegido pelo header Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const today = businessToday();

  // Vencidas (status local ou já vencidas pela data) sem lembrete hoje
  const overdueCharges = await db
    .select()
    .from(charges)
    .where(
      and(
        inArray(charges.status, ["pending", "overdue"]),
        lt(charges.dueDate, today),
        or(
          isNull(charges.lastReminderAt),
          sql`${charges.lastReminderAt} AT TIME ZONE 'America/Sao_Paulo' < ${SQL_TODAY}`,
        ),
      ),
    )
    .limit(100);

  let sent = 0;
  for (const charge of overdueCharges) {
    try {
      await notifyChargeReminder(charge);
      sent += 1;
    } catch (error) {
      console.error(`Falha no lembrete da cobrança ${charge.id}:`, error);
    }
  }

  return NextResponse.json({ ok: true, sent, checked: overdueCharges.length });
}
