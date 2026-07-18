import type { Metadata } from "next";
import Link from "next/link";

import { RegistrationCard } from "./registration-form";

export const metadata: Metadata = { title: "Cadastre sua empresa" };

export default function CadastroPage() {
  return (
    <main className="hero-glow flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-white.png" alt="WordPane" className="h-9 w-auto" />
          <p className="text-sm text-muted-foreground">
            Gestão de clientes, projetos e demandas
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <RegistrationCard />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          Já tem acesso?{" "}
          <Link
            href="/login"
            className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
