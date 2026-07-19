"use client";

import { Loader2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Charge } from "@/lib/db/schema";
import {
  chargeBillingTypeLabels,
  chargeBillingTypes,
} from "@/lib/validations/finance";
import { createChargeFromQuote } from "@/server/actions/finance";

/** Gera a cobrança (fatura Asaas) de um orçamento aprovado. */
export function ChargeFromQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [billingType, setBillingType] =
    useState<Charge["billingType"]>("pix");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!dueDate) {
      setError("Informe a data de vencimento.");
      return;
    }
    startTransition(async () => {
      const result = await createChargeFromQuote(quoteId, {
        billingType,
        dueDate,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Cobrança criada e enviada ao Asaas.");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Wallet />
        Gerar cobrança
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar cobrança do orçamento</DialogTitle>
            <DialogDescription>
              Uma cobrança com o valor total do orçamento será criada no Asaas
              e o cliente será notificado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Meio de pagamento *</Label>
              <Select
                value={billingType}
                onValueChange={(value) =>
                  setBillingType(value as Charge["billingType"])
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) => {
                      const t = chargeBillingTypes.find((t) => t === value);
                      return t ? chargeBillingTypeLabels[t] : "";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {chargeBillingTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {chargeBillingTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfq-due">Vencimento *</Label>
              <Input
                id="cfq-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

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
              onClick={() => setOpen(false)}
            >
              Voltar
            </Button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending && <Loader2 className="animate-spin" />}
              Criar cobrança
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
