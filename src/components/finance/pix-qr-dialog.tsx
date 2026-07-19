"use client";

import { Copy, Loader2, QrCode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PixQrCodeData = {
  image: string;
  payload: string;
  expirationDate: string;
};

/** Dialog com o QR Code PIX da cobrança (busca sob demanda na API). */
export function PixQrDialog({ chargeId }: { chargeId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PixQrCodeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setOpen(true);
    if (data) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/financeiro/${chargeId}/pix-qrcode`);
      const body = (await response.json().catch(() => null)) as
        | (PixQrCodeData & { error?: string })
        | null;
      if (!response.ok || !body?.image) {
        setError(body?.error ?? "Não foi possível gerar o QR Code.");
        return;
      }
      setData(body);
    } catch {
      setError("Não foi possível gerar o QR Code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={load}>
        <QrCode />
        Ver QR Code
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Pague com PIX</DialogTitle>
            <DialogDescription>
              Aponte a câmera do celular ou use o código copia-e-cola.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {data && (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${data.image}`}
                alt="QR Code PIX"
                className="mx-auto size-56 rounded-lg bg-white p-2"
              />
              <div className="flex items-center gap-2">
                <code className="max-h-20 min-w-0 flex-1 overflow-y-auto rounded-lg bg-muted/40 px-2 py-1.5 text-xs break-all">
                  {data.payload}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copiar código PIX"
                  onClick={() =>
                    navigator.clipboard.writeText(data.payload).then(
                      () => toast.success("Código PIX copiado."),
                      () => toast.error("Não foi possível copiar."),
                    )
                  }
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
