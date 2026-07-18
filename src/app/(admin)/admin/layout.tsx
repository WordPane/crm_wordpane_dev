import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SearchPalette } from "@/components/layout/search-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { countUnread, listNotifications } from "@/lib/queries/notifications";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  requireTeam(user);

  const [unreadNotifications, notifications] = await Promise.all([
    countUnread(user),
    listNotifications(user, 8),
  ]);

  return (
    <div className="min-h-screen">
      <AdminSidebar role={user.role} />

      <div className="flex min-h-screen flex-col pl-60">
        <header className="glass sticky top-0 z-30 flex h-16 items-center justify-end gap-3 border-b border-border px-6">
          <SearchPalette />
          <NotificationBell
            key={unreadNotifications}
            initialUnread={unreadNotifications}
            items={notifications}
            viewAllHref="/admin/notificacoes"
          />
          <UserMenu name={user.name} email={user.email} image={user.image} />
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
