import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortalNavbar } from "@/components/layout/portal-navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/access/permissions";
import { countUnread, listNotifications } from "@/lib/queries/notifications";
import { getPortalCompany, getPortalProfile } from "@/lib/queries/portal";
import { logout } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Portal do cliente" };

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.role !== "client") redirect("/admin/dashboard");

  const company = await getPortalCompany(user);
  if (!company) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 py-8 text-center">
            <p className="font-medium">Conta sem empresa vinculada</p>
            <p className="text-sm text-muted-foreground">
              Sua conta ainda não está associada a uma empresa. Fale com a
              equipe WordPane para concluir o cadastro.
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
      <PortalNavbar
        userName={user.name}
        userEmail={user.email}
        userImage={profile?.avatarUrl ? `/api/avatar/${user.id}` : null}
        companyName={company.name}
        unreadNotifications={unreadNotifications}
        notifications={notifications}
        canManageUsers={profile?.isCompanyAdmin ?? false}
      />
      <main className="mx-auto w-full max-w-6xl px-4 pt-24 pb-12 sm:px-6">
        {children}
      </main>
    </div>
  );
}
