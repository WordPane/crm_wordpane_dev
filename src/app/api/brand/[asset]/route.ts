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

function contrastColor(hex: string): string {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "WP";
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

function generateIconSvg(brand: Awaited<ReturnType<typeof getBranding>>): string {
  const text = initials(brand.appName);
  const textColor = contrastColor(brand.primaryColor);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${brand.appName}">
  <rect width="512" height="512" fill="${brand.primaryColor}" rx="96"/>
  <text x="256" y="320" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="220" font-weight="700" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${text}</text>
</svg>`;
}

/**
 * GET /api/brand/[asset] — logo/favicon/ícone da marca para telas públicas
 * (login, orçamento público, e-mails e manifesto PWA). Sem auth: só expõe
 * os assets de marca configurados, nada mais.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  if (asset !== "logo" && asset !== "favicon" && asset !== "icon" && asset !== "icon.svg") {
    return NextResponse.json({ error: "Asset não encontrado." }, { status: 404 });
  }

  const brand = await getBranding();

  if (asset === "icon" || asset === "icon.svg") {
    const svg = generateIconSvg(brand);
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  }

  const value = asset === "logo" ? brand.logoUrl : brand.faviconUrl;

  // URL absoluta (blob) ou path estático (marca padrão em /public)
  if (/^https?:\/\//i.test(value)) {
    return NextResponse.redirect(value);
  }
  if (value.startsWith("/")) {
    // Redirecionamento relativo: o navegador resolve no domínio atual,
    // evitando depender do host detectado pelo Next.js standalone.
    return NextResponse.redirect(value);
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
