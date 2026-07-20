"use client";

import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { emitChargeInvoice } from "@/server/actions/finance";

/** Emissão manual da nota fiscal de uma cobrança sem NF (paga ou em aberto). */
export function EmitInvoiceButton({
  chargeId,
  paid,
}: {
  chargeId: string;
  paid: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <FileText />
        Emitir NF
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Emitir nota fiscal"
        description={
          paid
            ? "A nota fiscal de serviço será emitida no Asaas para esta cobrança paga. Os arquivos PDF e XML ficam disponíveis quando autorizada."
            : "Atenção: esta cobrança ainda não foi paga. A nota fiscal será emitida imediatamente; se a cobrança for cancelada depois, a nota também será cancelada."
        }
        confirmLabel="Emitir"
        onConfirm={async () => {
          const result = await emitChargeInvoice(chargeId);
          if ("error" in result) return result.error;
          toast.success("Nota fiscal em emissão.");
          router.refresh();
          return null;
        }}
      />
    </>
  );
}
