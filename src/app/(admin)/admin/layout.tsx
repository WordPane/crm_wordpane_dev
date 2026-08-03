import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { MobileMenuButton } from "@/components/layout/mobile-menu-button";
import { NotificationBell } from "@/components/layout/notification-bell";
import { NotificationPopups } from "@/components/layout/notification-popups";
import { SearchPalette } from "@/components/layout/search-palette";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { UserMenu } from "@/components/layout/user-menu";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  countUnread,
  listNotifications,
  listRecentUnread,
} from "@/lib/queries/notifications";
import { hasSuperAdmin } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Instância nova sem super admin → wizard de configuração inicial
  if (!(await hasSuperAdmin())) redirect("/setup");

  const user = await requireUser();
  requireTeam(user);

  const [unreadNotifications, notifications, brand, prefs, recentUnread] =
    await Promise.all([
      countUnread(user),
      listNotifications(user, 8),
      getBranding(),
      db
        .select({
          notifyPopup: users.notifyPopup,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)
        .then((rows) => rows[0]),
      listRecentUnread(user, 50),
    ]);

  return (
    <SidebarProvider>
      <div className="min-h-screen">
        <AdminSidebar role={user.role} brand={brand} />
        <NotificationPopups
          enabled={prefs?.notifyPopup ?? false}
          initialIds={recentUnread.map((n) => n.id)}
        />

        <div className="flex min-h-screen flex-col lg:pl-60">
          <header
            className="glass sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 lg:justify-end lg:px-6"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              minHeight: "calc(4rem + env(safe-area-inset-top))",
            }}
          >
            <MobileMenuButton />
            <div className="flex items-center gap-3">
              <SearchPalette />
              <NotificationBell
                key={unreadNotifications}
                initialUnread={unreadNotifications}
                items={notifications}
                viewAllHref="/admin/notificacoes"
              />
              <UserMenu
                name={user.name}
                email={user.email}
                image={prefs?.avatarUrl ? `/api/avatar/${user.id}` : null}
                profileHref="/admin/perfil"
              />
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
