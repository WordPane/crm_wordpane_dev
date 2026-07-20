"use client";

import {
  EllipsisVertical,
  ExternalLink,
  FileCode2,
  FileText,
  Loader2,
  Mail,
  Pencil,
  ReceiptText,
  Trash2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  cancelCharge,
  emitChargeInvoice,
  resendChargeNotification,
  updateCharge,
} from "@/server/actions/finance";

type ChargeInvoiceInfo = {
  id: string;
  status: string;
  errorMessage: string | null;
} | null;

/**
 * Ações da cobrança consolidadas em um menu (⋯): nota fiscal, fatura,
 * edição, reenvio e cancelamento. Status intermediários da NF
 * ("emitindo", "com erro", "cancelada") aparecem como texto ao lado.
 */
export function ChargeActionsMenu({
  chargeId,
  description,
  valueCents,
  billingType,
  dueDate,
  status,
  invoiceUrl,
  invoice,
}: {
  chargeId: string;
  description: string;
  valueCents: number;
  billingType: Charge["billingType"];
  dueDate: string; // YYYY-MM-DD
  status: Charge["status"];
  invoiceUrl: string | null;
  invoice: ChargeInvoiceInfo;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"emit" | "edit" | "cancel" | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const paid = status === "received" || status === "confirmed";
  const open = status === "pending" || status === "overdue";
  const canEmit =
    status !== "cancelled" &&
    status !== "refunded" &&
    (!invoice || invoice.status === "error" || invoice.status === "canceled");

  function resend() {
    startTransition(async () => {
      const result = await resendChargeNotification(chargeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Cobrança reenviada ao cliente por e-mail.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {(invoice?.status === "scheduled" ||
        invoice?.status === "synchronized") && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          NF emitindo...
        </span>
      )}
      {invoice?.status === "error" && (
        <span
          className="text-xs whitespace-nowrap text-red-300"
          title={invoice.errorMessage ?? ""}
        >
          NF com erro
        </span>
      )}
      {invoice?.status === "canceled" && (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          NF cancelada
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Ações da cobrança ${description}`}
              className="text-muted-foreground"
            />
          }
        >
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {invoice?.status === "authorized" && (
            <>
              <DropdownMenuItem
                render={
                  <a
                    href={`/api/invoices/${invoice.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <FileText />
                NF em PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <a
                    href={`/api/invoices/${invoice.id}/xml`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <FileCode2 />
                NF em XML
              </DropdownMenuItem>
            </>
          )}
          {canEmit && (
            <DropdownMenuItem onClick={() => setDialog("emit")}>
              <ReceiptText />
              Emitir nota fiscal
            </DropdownMenuItem>
          )}
          {invoiceUrl && (
            <DropdownMenuItem
              render={
                <a href={invoiceUrl} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink />
              Ver fatura
            </DropdownMenuItem>
          )}
          {open && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setDialog("edit")}>
                <Pencil />
                Editar cobrança
              </DropdownMenuItem>
              <DropdownMenuItem disabled={pending} onClick={resend}>
                {pending ? <Loader2 className="animate-spin" /> : <Mail />}
                Reenviar por e-mail
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog("cancel")}
              >
                <Trash2 />
                Cancelar cobrança
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "emit"}
        onOpenChange={(openDialog) => !openDialog && setDialog(null)}
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

      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(openDialog) => !openDialog && setDialog(null)}
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

      <EditChargeDialog
        chargeId={chargeId}
        description={description}
        valueCents={valueCents}
        billingType={billingType}
        currentDueDate={dueDate}
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

/** Formulário de edição da cobrança em aberto (reflete no Asaas). */
function EditChargeDialog({
  chargeId,
  description,
  valueCents,
  billingType,
  currentDueDate,
  open,
  onClose,
}: {
  chargeId: string;
  description: string;
  valueCents: number;
  billingType: Charge["billingType"];
  currentDueDate: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [desc, setDesc] = useState(description);
  const [value, setValue] = useState(() => centsToInput(valueCents));
  const [billing, setBilling] = useState(billingType);
  const [dueDate, setDueDate] = useState(currentDueDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      // Reabre sempre com os valores atuais da cobrança
      setDesc(description);
      setValue(centsToInput(valueCents));
      setBilling(billingType);
      setDueDate(currentDueDate);
      setError(null);
    } else {
      onClose();
    }
  }

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
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            onClick={onClose}
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
  );
}

/** 150000 → "1500,00" (formato aceito por parseCurrencyToCents). */
function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
