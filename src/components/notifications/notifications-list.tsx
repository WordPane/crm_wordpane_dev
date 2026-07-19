"use client";

import {
  Bell,
  BellOff,
  CheckCheck,
  Inbox,
  MessageSquare,
  Paperclip,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { NotificationBellItem } from "@/components/layout/notification-bell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime, timeAgo } from "@/lib/utils/format";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/actions/notifications";

const ICONS: Record<string, LucideIcon> = {
  comment: MessageSquare,
  "demand.created": Inbox,
  "demand.status": Inbox,
  upload: Paperclip,
};

/** Lista completa de notificações (páginas /admin e /portal). */
export function NotificationsList({
  items,
}: {
  items: NotificationBellItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const isUnread = (item: NotificationBellItem) =>
    !item.readAt && !readIds.has(item.id);
  const unreadCount = items.filter(isUnread).length;

  function handleMarkAll() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Todas as notificações foram marcadas como lidas.");
      router.refresh();
    });
  }

  async function handleItemClick(item: NotificationBellItem) {
    if (isUnread(item)) {
      setReadIds((prev) => new Set(prev).add(item.id));
      await markNotificationRead(item.id);
    }
    if (item.href) router.push(item.href);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAll}
          disabled={pending || unreadCount === 0}
        >
          <CheckCheck className="size-4" />
          Marcar todas como lidas
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <BellOff className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhuma notificação</p>
            <p className="text-sm text-muted-foreground">
              Quando algo relevante acontecer, você será avisado por aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {items.map((item) => {
              const Icon = ICONS[item.type] ?? Bell;
              const unread = isUnread(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-white/[0.03] first:rounded-t-xl last:rounded-b-xl",
                    unread && "bg-primary/5",
                  )}
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                    <Icon className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm",
                        unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {item.title}
                    </span>
                    {item.body && (
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {item.body}
                      </span>
                    )}
                    <span
                      className="mt-1 block text-xs text-muted-foreground/70"
                      title={formatDateTime(item.createdAt)}
                    >
                      {timeAgo(item.createdAt)}
                    </span>
                  </span>
                  {unread && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
