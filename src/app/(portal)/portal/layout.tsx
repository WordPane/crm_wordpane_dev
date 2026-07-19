import { redirect } from "next/navigation";

import { PortalSidebar } from "@/components/layout/portal-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import { countUnread, listNotifications } from "@/lib/queries/notifications";
import { getPortalCompany, getPortalProfile } from "@/lib/queries/portal";
import { logout } from "@/server/actions/auth";
import { stopImpersonation } from "@/server/actions/impersonate";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role !== "client") redirect("/admin/dashboard");

  const [company, brand] = await Promise.all([
    getPortalCompany(user),
    getBranding(),
  ]);
  if (!company) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 py-8 text-center">
            <p className="font-medium">Conta sem empresa vinculada</p>
            <p className="text-sm text-muted-foreground">
              Sua conta ainda não está associada a uma empresa. Fale com a
              equipe {brand.appName} para concluir o cadastro.
            </p>
            <form action={logout}>
              <Button type="submit" variant="outline">
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Avatar fresco do banco (a sessão JWT só atualiza no próximo login)
  const [profile, unreadNotifications, notifications] = await Promise.all([
    getPortalProfile(user),
    countUnread(user),
    listNotifications(user, 8),
  ]);

  return (
    <div className="min-h-screen">
      <PortalSidebar
        companyName={company.name}
        canManageUsers={profile?.isCompanyAdmin ?? false}
        brand={brand}
      />

      <div className="flex min-h-screen flex-col pl-60">
        {user.impersonatedBy && (
          <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
            Você está acessando como {user.name} (impersonação do super admin).
            <form action={stopImpersonation}>
              <button
                type="submit"
                className="font-semibold underline underline-offset-2"
              >
                Voltar ao meu acesso
              </button>
            </form>
          </div>
        )}

        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b border-border px-6">
          <NotificationBell
            key={unreadNotifications}
            initialUnread={unreadNotifications}
            items={notifications}
            viewAllHref="/portal/notificacoes"
          />
          <UserMenu
            name={user.name}
            email={user.email}
            image={profile?.avatarUrl ? `/api/avatar/${user.id}` : null}
            profileHref="/portal/perfil"
          />
        </header>

        <main className="flex-1 p-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
