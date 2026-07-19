"use client";

import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resendChargeNotification } from "@/server/actions/finance";

/** Reenvia a notificação/e-mail da cobrança para o cliente. */
export function ResendChargeButton({ chargeId }: { chargeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function resend() {
    startTransition(async () => {
      const result = await resendChargeNotification(chargeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSent(true);
      toast.success("Cobrança reenviada ao cliente por e-mail.");
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending || sent}
      title="Reenviar cobrança por e-mail"
      onClick={resend}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Mail />}
      {sent ? "Reenviada" : "Reenviar"}
    </Button>
  );
}
