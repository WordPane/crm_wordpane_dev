"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  isPriorityNotification,
  notificationIcon,
} from "@/lib/notification-display";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils/format";
import { markNotificationRead } from "@/server/actions/notifications";

export type NotificationBellItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

const POLL_INTERVAL_MS = 60_000;

/** Sino do header: badge com não lidas (polling 60s) + dropdown com as recentes. */
export function NotificationBell({
  initialUnread,
  items,
  viewAllHref,
}: {
  initialUnread: number;
  items: NotificationBellItem[];
  viewAllHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);

  // Polling leve do contador; quando muda, refresca para buscar a lista nova
  // (o layout passa key={unread} — o refresh remonta o sino já sincronizado)
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/notifications/unread-count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number };
        setUnread((current) => {
          if (data.count !== current) router.refresh();
          return data.count;
        });
      } catch {
        // Sem resposta — tenta de novo no próximo ciclo
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  async function handleItemClick(item: NotificationBellItem) {
    setOpen(false);
    if (!item.readAt) {
      setUnread((value) => Math.max(0, value - 1));
      await markNotificationRead(item.id);
    }
    if (item.href) router.push(item.href);
    router.refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground"
            aria-label="Notificações"
          />
        }
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notificações</p>
          {unread > 0 && (
            <span className="chip">
              {unread} não {unread === 1 ? "lida" : "lidas"}
            </span>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação por aqui.
            </p>
          ) : (
            items.map((item) => {
              const Icon = notificationIcon(item.type);
              const isUnread = !item.readAt;
              const priority = isPriorityNotification(item.type);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]",
                    isUnread && (priority ? "bg-amber-400/5" : "bg-primary/5"),
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1",
                      priority
                        ? "bg-amber-400/10 ring-amber-400/30"
                        : "bg-muted ring-border",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-3.5",
                        priority ? "text-amber-400" : "text-muted-foreground",
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                    {item.body && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.body}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground/70">
                      {timeAgo(item.createdAt)}
                    </span>
                  </span>
                  {isUnread && (
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        priority ? "bg-amber-400" : "bg-primary",
                      )}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <Link
            href={viewAllHref}
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Ver todas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
