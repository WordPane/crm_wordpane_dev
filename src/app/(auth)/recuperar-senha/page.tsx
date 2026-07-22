import type { Metadata } from "next";
import Link from "next/link";

import { brandAssetUrl } from "@/lib/brand/config";
import { getBranding } from "@/lib/brand/settings";

import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default async function ForgotPasswordPage() {
  const brand = await getBranding();

  return (
    <main className="hero-glow flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brandAssetUrl(brand, "logo")}
            alt={brand.appName}
            className="h-9 w-auto"
          />
          <p className="text-sm text-muted-foreground">
            Gestão de clientes, projetos e demandas
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <h1 className="mb-2 text-center text-lg font-bold">
            Recuperar senha
          </h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Informe seu e-mail para receber o link de redefinição.
          </p>
          <ResetRequestForm />
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Lembrou a senha?{" "}
          <Link
            href="/login"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Voltar para o login
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} {brand.appName} — Uso interno e clientes
        </p>
      </div>
    </main>
  );
}
