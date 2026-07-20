"use client";

import { BellOff, Check, CheckCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { NotificationBellItem } from "@/components/layout/notification-bell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  isPriorityNotification,
  notificationIcon,
} from "@/lib/notification-display";
import { cn } from "@/lib/utils";
import { formatDateTime, timeAgo } from "@/lib/utils/format";
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/actions/notifications";

/** Lista completa de notificações (páginas /admin e /portal). */
export function NotificationsList({
  items,
}: {
  items: NotificationBellItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<NotificationBellItem | null>(null);

  const isUnread = (item: NotificationBellItem) =>
    !item.readAt && !readIds.has(item.id);
  const visibleItems = items.filter((item) => !deletedIds.has(item.id));
  const unreadCount = visibleItems.filter(isUnread).length;

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

  async function markRead(id: string) {
    setReadIds((prev) => new Set(prev).add(id));
    const result = await markNotificationRead(id);
    if ("error" in result) {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error(result.error);
    }
  }

  async function handleItemClick(item: NotificationBellItem) {
    if (isUnread(item)) await markRead(item.id);
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

      {visibleItems.length === 0 ? (
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
            {visibleItems.map((item) => {
              const Icon = notificationIcon(item.type);
              const unread = isUnread(item);
              const priority = isPriorityNotification(item.type);
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2 px-4 py-4 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.03]",
                    unread && (priority ? "bg-amber-400/5" : "bg-primary/5"),
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="flex min-w-0 flex-1 items-start gap-4 text-left"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1",
                        priority
                          ? "bg-amber-400/10 ring-amber-400/30"
                          : "bg-muted ring-border",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4",
                          priority ? "text-amber-400" : "text-muted-foreground",
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "block text-sm",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {item.title}
                        </span>
                        {priority && (
                          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-amber-400 uppercase">
                            Prioridade
                          </span>
                        )}
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
                      <span
                        className={cn(
                          "mt-2 size-2 shrink-0 rounded-full",
                          priority ? "bg-amber-400" : "bg-primary",
                        )}
                      />
                    )}
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {unread && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Marcar como lida"
                        title="Marcar como lida"
                        onClick={() => markRead(item.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Excluir notificação"
                      title="Excluir notificação"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir notificação"
        description={
          deleting
            ? `Tem certeza que deseja excluir a notificação "${deleting.title}"?`
            : ""
        }
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (!deleting) return null;
          const result = await deleteNotification(deleting.id);
          if ("error" in result) return result.error;
          setDeletedIds((prev) => new Set(prev).add(deleting.id));
          toast.success("Notificação excluída.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
