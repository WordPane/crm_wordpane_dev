import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
  gif: "image/gif",
};

function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * GET /api/avatar/[userId] — foto de perfil para exibição em <img>.
 * Equipe vê todos; cliente vê a si mesmo, colegas da própria empresa
 * e membros da equipe (autores de comentários/responsáveis).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const user = await requireUser();
  const { userId } = await params;

  const [target] = await db
    .select({
      id: users.id,
      role: users.role,
      companyId: users.companyId,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target?.avatarUrl) {
    return NextResponse.json({ error: "Avatar não encontrado." }, { status: 404 });
  }

  if (user.role === "client") {
    const allowed =
      target.id === user.id ||
      target.role !== "client" ||
      (target.companyId !== null && target.companyId === user.companyId);
    if (!allowed) {
      return NextResponse.json({ error: "Avatar não encontrado." }, { status: 404 });
    }
  }

  // Driver blob: avatarUrl já é URL pública
  if (/^https?:\/\//i.test(target.avatarUrl)) {
    return NextResponse.redirect(target.avatarUrl);
  }

  const buffer = await getStorage().get(target.avatarUrl);
  if (!buffer) {
    return NextResponse.json({ error: "Avatar não encontrado." }, { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeFor(target.avatarUrl),
      "Cache-Control": "private, max-age=300",
    },
  });
}
