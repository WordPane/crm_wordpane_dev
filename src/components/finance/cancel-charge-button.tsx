"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelCharge } from "@/server/actions/finance";

/** Cancela a cobrança no Asaas e localmente (com confirmação). */
export function CancelChargeButton({
  chargeId,
  description,
}: {
  chargeId: string;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Cancelar cobrança ${description}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancelar cobrança"
        description={`Tem certeza que deseja cancelar a cobrança "${description}"? Ela também será excluída no Asaas.`}
        confirmLabel="Cancelar cobrança"
        onConfirm={async () => {
          const result = await cancelCharge(chargeId);
          if ("error" in result) return result.error;
          toast.success("Cobrança cancelada.");
          router.refresh();
          return null;
        }}
      />
    </>
  );
}
