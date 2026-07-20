import { NextResponse } from "next/server";

import { requireUser } from "@/lib/access/permissions";
import { listRecentUnread } from "@/lib/queries/notifications";

/** GET /api/notifications/recent — não lidas recentes (polling do popup). */
export async function GET() {
  const user = await requireUser();
  const items = await listRecentUnread(user);
  return NextResponse.json({ items });
}
