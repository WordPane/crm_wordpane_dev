import type { Metadata } from "next";

import { NotificationsList } from "@/components/notifications/notifications-list";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listNotifications } from "@/lib/queries/notifications";

export const metadata: Metadata = { title: "Notificações" };

export default async function AdminNotificationsPage() {
  const user = await requireUser();
  requireTeam(user);

  const items = await listNotifications(user, 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Notificações</h1>
        <p className="text-sm text-muted-foreground">
          As {items.length === 50 ? "50 " : ""}notificações mais recentes da sua
          conta.
        </p>
      </div>

      <NotificationsList items={items} />
    </div>
  );
}
