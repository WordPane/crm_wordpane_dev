import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="hero-glow flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-white.png" alt="WordPane" className="h-9 w-auto" />
          <p className="text-sm text-muted-foreground">
            Gestão de clientes, projetos e demandas
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
          <h1 className="mb-6 text-center text-lg font-bold">Acesse sua conta</h1>
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Ainda não tem acesso?{" "}
          <Link
            href="/cadastro"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Cadastre sua empresa
          </Link>
        </p>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} WordPane — Uso interno e clientes
        </p>
      </div>
    </main>
  );
}
