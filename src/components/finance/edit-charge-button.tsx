"use client";

import { Loader2, Pencil } from "lucide-react";
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
import { updateCharge } from "@/server/actions/finance";

/** Edita descrição, valor, meio de pagamento e vencimento da cobrança em aberto (reflete no Asaas). */
export function EditChargeButton({
  chargeId,
  description,
  valueCents,
  billingType,
  currentDueDate,
}: {
  chargeId: string;
  description: string;
  valueCents: number;
  billingType: Charge["billingType"];
  currentDueDate: string; // YYYY-MM-DD
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(description);
  const [value, setValue] = useState(() => centsToInput(valueCents));
  const [billing, setBilling] = useState(billingType);
  const [dueDate, setDueDate] = useState(currentDueDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateCharge({
        chargeId,
        description: desc,
        value,
        billingType: billing,
        dueDate,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Cobrança atualizada no Asaas.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Editar cobrança ${description}`}
        className="text-muted-foreground"
        onClick={() => {
          setDesc(description);
          setValue(centsToInput(valueCents));
          setBilling(billingType);
          setDueDate(currentDueDate);
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar cobrança</DialogTitle>
            <DialogDescription>
              As alterações serão atualizadas também no Asaas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`edit-desc-${chargeId}`}>Descrição</Label>
            <Input
              id={`edit-desc-${chargeId}`}
              value={desc}
              onChange={(event) => setDesc(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`edit-value-${chargeId}`}>Valor (R$)</Label>
            <Input
              id={`edit-value-${chargeId}`}
              inputMode="decimal"
              placeholder="0,00"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Meio de pagamento</Label>
            <Select
              value={billing}
              onValueChange={(value) =>
                setBilling(value as Charge["billingType"])
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
            <Label htmlFor={`edit-due-${chargeId}`}>Vencimento</Label>
            <Input
              id={`edit-due-${chargeId}`}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
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
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !desc.trim() || !value.trim() || !dueDate}
            >
              {pending && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 150000 → "1500,00" (formato aceito por parseCurrencyToCents). */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
