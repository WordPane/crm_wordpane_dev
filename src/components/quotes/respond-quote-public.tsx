"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { respondQuotePublic } from "@/server/actions/quotes";

/** Resposta ao orçamento via link público (sem login): nome obrigatório. */
export function RespondQuotePublic({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "approved" | "rejected" | null
  >(null);
  const [, startTransition] = useTransition();

  function respond(action: "approved" | "rejected") {
    setError(null);
    if (!name.trim()) {
      setError("Informe seu nome para responder ao orçamento.");
      return;
    }
    setPendingAction(action);
    startTransition(async () => {
      const result = await respondQuotePublic(token, {
        action,
        name: name.trim(),
        note: note.trim() || undefined,
      });
      setPendingAction(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(
        action === "approved"
          ? "Orçamento aprovado! A equipe foi notificada."
          : "Resposta enviada. A equipe foi notificada.",
      );
      router.refresh();
    });
  }

  const pending = pendingAction !== null;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="rqp-name">Seu nome *</Label>
        <Input
          id="rqp-name"
          placeholder="Quem está respondendo por a empresa?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rqp-note">Comentário (opcional)</Label>
        <Textarea
          id="rqp-note"
          placeholder="Ex.: aprovado, podemos começar; ou o motivo da recusa..."
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => respond("approved")}>
          {pendingAction === "approved" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Check />
          )}
          Aprovar orçamento
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => respond("rejected")}
        >
          {pendingAction === "rejected" ? (
            <Loader2 className="animate-spin" />
          ) : (
            <X />
          )}
          Recusar
        </Button>
      </div>
    </div>
  );
}
