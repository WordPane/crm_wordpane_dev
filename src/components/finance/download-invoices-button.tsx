"use client";

import { Download, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formatLabels: Record<string, string> = {
  ambos: "PDF + XML",
  pdf: "Somente PDF",
  xml: "Somente XML",
};

/**
 * Baixa um ZIP com as notas autorizadas dentro dos filtros atuais da tela
 * (status, empresa, período) — para envio à contabilidade.
 */
export function DownloadInvoicesButton() {
  const searchParams = useSearchParams();
  const [format, setFormat] = useState("ambos");
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const key of ["status", "empresa", "periodo", "base"]) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }
      params.set("formato", format);

      const response = await fetch(`/api/invoices/download?${params}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(
          data?.error ?? "Não foi possível baixar as notas. Tente novamente.",
        );
        return;
      }

      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? "notas-fiscais.zip";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP das notas baixado.");
    } catch {
      toast.error("Falha de rede ao baixar as notas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={format} onValueChange={(v) => setFormat(v ?? "ambos")}>
        <SelectTrigger aria-label="Formato do download" className="w-auto">
          <SelectValue>
            {(value: string | null) => formatLabels[value ?? "ambos"]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ambos">PDF + XML</SelectItem>
          <SelectItem value="pdf">Somente PDF</SelectItem>
          <SelectItem value="xml">Somente XML</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={download}
      >
        {loading ? <Loader2 className="animate-spin" /> : <Download />}
        Baixar notas
      </Button>
    </div>
  );
}
