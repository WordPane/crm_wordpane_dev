import { DEFAULT_BRAND, type BrandConfig } from "@/lib/brand/config";

/**
 * Deriva os overrides de tema (CSS vars) a partir das cores da marca.
 * Quando as cores são as padrão, retorna "" — a instância WordPane
 * permanece pixel a pixel idêntica, sem nenhum override injetado.
 */

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mistura a→b com o peso de b (0 = cor a, 1 = cor b). */
function mix(a: string, b: string, weight: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * weight,
    g: ca.g + (cb.g - ca.g) * weight,
    b: ca.b + (cb.b - ca.b) * weight,
  });
}

function alpha(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Tons derivados usados em superfícies fora do CSS (e-mail transacional). */
export function brandEmailColors(brand: BrandConfig): {
  primary: string;
  primaryAlt: string;
  background: string;
  card: string;
  onPrimary: string;
} {
  return {
    primary: brand.primaryColor,
    primaryAlt: mix(brand.primaryColor, "#000000", 0.18),
    background: brand.backgroundColor,
    card: mix(brand.backgroundColor, "#ffffff", 0.06),
    onPrimary: brand.backgroundColor,
  };
}

/** CSS com as variáveis de tema sobrescritas pelas cores da marca. */
export function buildBrandCss(brand: BrandConfig): string {
  const primary = brand.primaryColor.toLowerCase();
  const background = brand.backgroundColor.toLowerCase();
  if (
    primary === DEFAULT_BRAND.primaryColor &&
    background === DEFAULT_BRAND.backgroundColor
  ) {
    return "";
  }

  // Tons derivados nas mesmas proporções do tema original (globals.css)
  const green2 = mix(primary, "#000000", 0.18);
  const greenLight = mix(primary, "#ffffff", 0.55);
  const navySoft = mix(background, "#ffffff", 0.04);
  const card = mix(background, "#ffffff", 0.06);
  const accent = mix(background, "#ffffff", 0.1);

  return (
    ":root,.dark{" +
    `--green:${primary};` +
    `--green-2:${green2};` +
    `--green-light:${greenLight};` +
    `--navy:${background};` +
    `--navy-soft:${navySoft};` +
    `--background:${background};` +
    `--card:${card};` +
    `--popover:${card};` +
    `--primary:${primary};` +
    `--primary-foreground:${background};` +
    `--secondary:${navySoft};` +
    `--muted:${navySoft};` +
    `--accent:${accent};` +
    `--ring:${primary};` +
    `--chart-1:${primary};` +
    `--chart-2:${green2};` +
    `--chart-3:${greenLight};` +
    `--sidebar:${background};` +
    `--sidebar-primary:${primary};` +
    `--sidebar-primary-foreground:${background};` +
    `--sidebar-accent:${navySoft};` +
    `--sidebar-ring:${primary};` +
    `--brand-gradient:linear-gradient(120deg, ${primary} 0%, ${green2} 100%);` +
    `--glow-primary:0 8px 28px ${alpha(primary, 0.35)};` +
    `--glow-primary-hover:0 12px 34px ${alpha(primary, 0.45)};` +
    `--hero-glow:${alpha(primary, 0.16)};` +
    "}"
  );
}
