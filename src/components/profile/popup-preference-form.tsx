"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { updatePopupPreference } from "@/server/actions/profile";

/** Toggle da preferência de popup de notificações (salva na hora). */
export function PopupPreferenceForm({
  defaultEnabled,
}: {
  defaultEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [pending, startTransition] = useTransition();

  function toggle(checked: boolean) {
    const previous = enabled;
    setEnabled(checked);
    startTransition(async () => {
      const result = await updatePopupPreference(checked);
      if ("error" in result) {
        setEnabled(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        checked
          ? "Popups de notificação ativados."
          : "Popups de notificação desativados.",
      );
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="notify-popup"
        className="mt-0.5"
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) => toggle(checked)}
      />
      <div className="space-y-1">
        <Label htmlFor="notify-popup" className="font-medium">
          Receber notificações em popup na tela
        </Label>
        <p className="text-sm text-muted-foreground">
          Quando ativo, novas notificações aparecem como aviso flutuante com
          atalho para o conteúdo. Desligado, elas chegam apenas no sino do
          cabeçalho.
        </p>
      </div>
    </div>
  );
}
