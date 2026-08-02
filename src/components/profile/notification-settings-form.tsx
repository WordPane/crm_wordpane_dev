"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { NotificationCategory } from "@/lib/db/schema";
import type { NotificationSettingsValues } from "@/lib/validations/profile";
import { updateNotificationSettings } from "@/server/actions/profile";

const CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: "task", label: "Tarefas" },
  { key: "comment", label: "Comentários" },
  { key: "project", label: "Projetos" },
  { key: "demand", label: "Demandas" },
  { key: "quote", label: "Orçamentos" },
  { key: "charge", label: "Cobranças" },
  { key: "system", label: "Sistema" },
];

const CHANNELS = [
  { key: "in_app", label: "No app" },
  { key: "email", label: "E-mail" },
  { key: "digest", label: "Digest diário" },
] as const;

export function NotificationSettingsForm({
  defaultSettings,
}: {
  defaultSettings: NotificationSettingsValues | null;
}) {
  const [settings, setSettings] = useState<NotificationSettingsValues>(
    defaultSettings ?? {},
  );
  const [pending, startTransition] = useTransition();

  function toggleChannel(
    category: NotificationCategory,
    channel: "in_app" | "email" | "digest",
  ) {
    setSettings((prev) => {
      const current = prev.channels?.[category] ?? ["in_app"];
      const next = current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel];
      return {
        ...prev,
        channels: { ...prev.channels, [category]: next },
      };
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateNotificationSettings(settings);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Preferências salvas.");
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const active = settings.channels?.[cat.key] ?? ["in_app"];
          return (
            <div
              key={cat.key}
              className="rounded-lg bg-white/[0.02] p-3 ring-1 ring-foreground/10"
            >
              <p className="mb-2 text-sm font-medium">{cat.label}</p>
              <div className="flex flex-wrap gap-4">
                {CHANNELS.map((ch) => (
                  <label
                    key={ch.key}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Checkbox
                      checked={active.includes(ch.key)}
                      onCheckedChange={() => toggleChannel(cat.key, ch.key)}
                      disabled={pending}
                    />
                    {ch.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={settings.digest ?? false}
          onCheckedChange={(checked) =>
            setSettings((prev) => ({ ...prev, digest: checked === true }))
          }
          disabled={pending}
        />
        <span>Receber digest diário por e-mail (resumo do dia)</span>
      </label>

      <Button size="sm" disabled={pending} onClick={save}>
        Salvar preferências
      </Button>
    </div>
  );
}
