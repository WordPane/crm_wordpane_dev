import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AsaasSettingsForm } from "@/components/settings/asaas-settings-form";
import { BrandSettingsForm } from "@/components/settings/brand-settings-form";
import { EmailSettingsForm } from "@/components/settings/email-settings-form";
import { IssuerSettingsForm } from "@/components/settings/issuer-settings-form";
import { BootstrapAdminForm } from "@/components/setup/bootstrap-admin-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/access/permissions";
import { getMaskedAsaasSettings } from "@/lib/asaas/settings";
import { brandAssetUrl } from "@/lib/brand/config";
import { getBranding } from "@/lib/brand/settings";
import { getMaskedEmailSettings } from "@/lib/email/settings";
import { getIssuer } from "@/lib/issuer";
import { hasSuperAdmin } from "@/lib/setup";

export const metadata: Metadata = { title: "Configuração inicial" };

/**
 * Wizard de primeiro acesso de uma instância nova.
 * Passo 1 (sem super admin): cria a conta do super administrador.
 * Passo 2 (sessão de super admin): marca, emissor, e-mail e Asaas.
 */
export default async function SetupPage() {
  const brand = await getBranding();

  if (!(await hasSuperAdmin())) {
    return (
      <main className="hero-glow flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brandAssetUrl(brand, "logo")}
              alt={brand.appName}
              className="h-9 w-auto"
            />
            <div>
              <h1 className="text-xl font-extrabold">Bem-vindo ao {brand.appName}</h1>
              <p className="text-sm text-muted-foreground">
                Passo 1 de 2 — crie o administrador da instância.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Super administrador</CardTitle>
              <CardDescription>
                Dono da instância: tem acesso às configurações, à equipe e a
                todas as empresas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BootstrapAdminForm />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Passo 2: exige sessão de super admin
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "super_admin") {
    redirect(user.role === "client" ? "/portal/dashboard" : "/admin/dashboard");
  }

  const [issuer, emailSettings, asaasSettings] = await Promise.all([
    getIssuer(),
    getMaskedEmailSettings(),
    getMaskedAsaasSettings(),
  ]);

  return (
    <main className="hero-glow min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={brandAssetUrl(brand, "logo")}
            alt={brand.appName}
            className="h-8 w-auto"
          />
          <div>
            <h1 className="text-xl font-extrabold">Configuração inicial</h1>
            <p className="text-sm text-muted-foreground">
              Passo 2 de 2 — personalize a instância. Tudo pode ser ajustado
              depois em Admin → Configurações.
            </p>
          </div>
        </div>

        <BrandSettingsForm brand={brand} />
        <IssuerSettingsForm issuer={issuer} />
        <EmailSettingsForm settings={emailSettings} appName={brand.appName} />
        <AsaasSettingsForm
          settings={asaasSettings}
          appUrl={emailSettings?.appUrl}
        />

        <div className="flex justify-center pb-6">
          <Button render={<Link href="/admin/dashboard" />} size="lg">
            Concluir e ir para o dashboard
          </Button>
        </div>
      </div>
    </main>
  );
}
