import type { Metadata } from "next";
import Link from "next/link";

import { brandAssetUrl } from "@/lib/brand/config";
import { getBranding } from "@/lib/brand/settings";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const brand = await getBranding();
  const { token } = await searchParams;
  const resetToken = (Array.isArray(token) ? token[0] : token) ?? "";

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
            Redefinir senha
          </h1>
          {resetToken ? (
            <>
              <p className="mb-6 text-center text-sm text-muted-foreground">
                Escolha a nova senha da sua conta.
              </p>
              <ResetPasswordForm token={resetToken} />
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Link inválido. Solicite uma{" "}
              <Link
                href="/recuperar-senha"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                nova redefinição de senha
              </Link>
              .
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} {brand.appName} — Uso interno e clientes
        </p>
      </div>
    </main>
  );
}
