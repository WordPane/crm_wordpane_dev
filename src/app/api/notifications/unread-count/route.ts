import { NextResponse } from "next/server";

import { requireUser } from "@/lib/access/permissions";
import { countUnread } from "@/lib/queries/notifications";

/** GET /api/notifications/unread-count — contagem para o badge do sino (polling). */
export async function GET() {
  const user = await requireUser();
  const count = await countUnread(user);
  return NextResponse.json({ count });
}
