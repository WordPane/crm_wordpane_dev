import type { MetadataRoute } from "next";

import { getBranding } from "@/lib/brand/settings";

export const dynamic = "force-dynamic";

function shortName(name: string): string {
  if (name.length <= 12) return name;
  return name.slice(0, 11).trimEnd() + "…";
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBranding();

  return {
    name: brand.appName,
    short_name: shortName(brand.appName),
    description: `Gestão de clientes, projetos e demandas — ${brand.appName}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: brand.backgroundColor,
    theme_color: brand.primaryColor,
    icons: [
      {
        src: "/api/brand/icon",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/api/brand/icon",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/brand/favicon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
