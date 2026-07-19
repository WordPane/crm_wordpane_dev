import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_BRAND, brandAssetUrl } from "@/lib/brand/config";
import { getBranding } from "@/lib/brand/settings";
import { buildBrandCss } from "@/lib/brand/theme";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBranding();
  const customFavicon = brand.faviconUrl !== DEFAULT_BRAND.faviconUrl;
  return {
    title: {
      default: brand.appName,
      template: `%s | ${brand.appName}`,
    },
    description: `Gestão de clientes, projetos e demandas — ${brand.appName}`,
    icons: customFavicon
      ? { icon: [{ url: brandAssetUrl(brand, "favicon") }] }
      : {
          icon: [
            { url: "/brand/favicon.ico" },
            { url: "/brand/favicon.png", type: "image/png" },
          ],
          apple: "/brand/apple-touch-icon.png",
        },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const brand = await getBranding();
  const brandCss = buildBrandCss(brand);

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {brandCss && <style dangerouslySetInnerHTML={{ __html: brandCss }} />}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
