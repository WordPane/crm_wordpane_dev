import type { Metadata } from "next";

import { NotificationsList } from "@/components/notifications/notifications-list";
import { requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import { listNotifications } from "@/lib/queries/notifications";

export const metadata: Metadata = { title: "Notificações" };

export default async function PortalNotificationsPage() {
  const user = await requireUser();

  const items = await listNotifications(user, 50);
  const brand = await getBranding();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Notificações</h1>
        <p className="text-sm text-muted-foreground">
          Novidades da equipe {brand.appName} sobre seus projetos e demandas.
        </p>
      </div>

      <NotificationsList items={items} />
    </div>
  );
}
