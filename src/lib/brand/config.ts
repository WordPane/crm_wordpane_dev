/**
 * Configuração de marca (white-label) — tipos e defaults PUROS.
 * Sem imports de servidor: pode ser usado em client components.
 * A leitura/gravação fica em ./settings.ts (server-only).
 */

export type BrandConfig = {
  appName: string;
  /** URL http (blob), fileKey do storage local ou path estático "/brand/...". */
  logoUrl: string;
  faviconUrl: string;
  /** #RRGGBB */
  primaryColor: string;
  backgroundColor: string;
};

/** Marca WordPane (fallback quando nada foi salvo ainda). */
export const DEFAULT_BRAND: BrandConfig = {
  appName: "WordPane CRM",
  logoUrl: "/brand/logo-white.png",
  faviconUrl: "/brand/favicon.png",
  primaryColor: "#00d164",
  backgroundColor: "#071928",
};

export type BrandAsset = "logo" | "favicon";

/**
 * URL de exibição de um asset da marca. Uploads customizados passam pela
 * rota pública /api/brand/[asset] (resolve blob/local); paths estáticos
 * são usados direto.
 */
export function brandAssetUrl(brand: BrandConfig, asset: BrandAsset): string {
  const value = asset === "logo" ? brand.logoUrl : brand.faviconUrl;
  if (value.startsWith("/")) return value;
  return `/api/brand/${asset}`;
}

/** Hex #RRGGBB válido? (inputs type="color" exigem o formato) */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
