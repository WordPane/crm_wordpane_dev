"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { respondQuote } from "@/server/actions/quotes";

/** Ações do cliente no portal: aprovar ou recusar o orçamento enviado. */
export function RespondQuoteButtons({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await respondQuote(quoteId, {
        action: "rejected",
        note: note.trim() || undefined,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRejectOpen(false);
      toast.success("Orçamento recusado. A equipe foi notificada.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setApproveOpen(true)}>
        <Check />
        Aprovar orçamento
      </Button>
      <Button variant="outline" onClick={() => setRejectOpen(true)}>
        <X />
        Recusar
      </Button>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Aprovar orçamento"
        description="Ao aprovar, a equipe será notificada e poderá iniciar o projeto. Deseja confirmar a aprovação deste orçamento?"
        confirmLabel="Aprovar"
        onConfirm={async () => {
          const result = await respondQuote(quoteId, { action: "approved" });
          if ("error" in result) return result.error;
          toast.success("Orçamento aprovado! A equipe foi notificada.");
          router.refresh();
          return null;
        }}
      />

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar orçamento</DialogTitle>
            <DialogDescription>
              Conte o motivo da recusa (opcional) — isso ajuda a equipe a
              ajustar uma nova proposta.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Ex.: valor acima do previsto, escopo incompleto..."
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setRejectOpen(false)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleReject}
            >
              {pending && <Loader2 className="animate-spin" />}
              Recusar orçamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
