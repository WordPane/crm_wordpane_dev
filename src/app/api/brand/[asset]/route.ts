import { NextResponse } from "next/server";

import { getBranding } from "@/lib/brand/settings";
import { getStorage } from "@/lib/storage";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
};

/**
 * GET /api/brand/[asset] — logo/favicon da marca para telas públicas
 * (login, orçamento público, e-mails). Sem auth: só expõe os assets
 * de marca configurados, nada mais.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  if (asset !== "logo" && asset !== "favicon") {
    return NextResponse.json({ error: "Asset não encontrado." }, { status: 404 });
  }

  const brand = await getBranding();
  const value = asset === "logo" ? brand.logoUrl : brand.faviconUrl;

  // URL absoluta (blob) ou path estático (marca padrão em /public)
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) {
    return NextResponse.redirect(new URL(value, request.url));
  }

  const buffer = await getStorage().get(value);
  if (!buffer) {
    return NextResponse.json({ error: "Asset não encontrado." }, { status: 404 });
  }

  const ext = value.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=3600",
    },
  });
}
