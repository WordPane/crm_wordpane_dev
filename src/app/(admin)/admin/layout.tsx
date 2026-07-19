import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SearchPalette } from "@/components/layout/search-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import { countUnread, listNotifications } from "@/lib/queries/notifications";
import { hasSuperAdmin } from "@/lib/setup";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Instância nova sem super admin → wizard de configuração inicial
  if (!(await hasSuperAdmin())) redirect("/setup");

  const user = await requireUser();
  requireTeam(user);

  const [unreadNotifications, notifications, brand] = await Promise.all([
    countUnread(user),
    listNotifications(user, 8),
    getBranding(),
  ]);

  return (
    <div className="min-h-screen">
      <AdminSidebar role={user.role} brand={brand} />

      <div className="flex min-h-screen flex-col pl-60">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b border-border px-6">
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
            image={user.image}
            profileHref="/admin/perfil"
          />
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
