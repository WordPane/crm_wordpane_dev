"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { isPriorityNotification } from "@/lib/notification-display";

type RecentItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
};

const POLL_INTERVAL_MS = 60_000;

/**
 * Dispara um toast para cada notificação nova que chega (preferência do
 * usuário, ativada no perfil). Renderiza null — só tem efeitos.
 * Os ids iniciais são a semente: não dispara popup para o que já existia.
 */
export function NotificationPopups({
  enabled,
  initialIds,
}: {
  enabled: boolean;
  initialIds: string[];
}) {
  const router = useRouter();
  const seenRef = useRef<Set<string>>(new Set(initialIds));

  useEffect(() => {
    if (!enabled) return;
    const seen = seenRef.current;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/notifications/recent", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items: RecentItem[] };
        // Mais antigas primeiro: toasts saem na ordem em que aconteceram
        for (const item of [...data.items].reverse()) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          const href = item.href;
          const options = {
            description: item.body ?? undefined,
            duration: 8000,
            action: href
              ? { label: "Ver", onClick: () => router.push(href) }
              : undefined,
          };
          // Demandas de clientes são prioridade: popup em destaque (âmbar)
          if (isPriorityNotification(item.type)) {
            toast.warning(item.title, options);
          } else {
            toast(item.title, options);
          }
        }
      } catch {
        // Sem resposta — próximo ciclo tenta de novo
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, router]);

  return null;
}
