"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/reports/export-csv";
import type { ActionResult } from "@/server/actions/utils";

export function ExportCsvButton({
  filename,
  action,
  label = "Exportar CSV",
}: {
  filename: string;
  action: () => Promise<ActionResult & { csv?: string }>;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (!result.csv) {
        toast.error("Nenhum dado para exportar.");
        return;
      }
      setDownloading(true);
      downloadCsv(filename, result.csv);
      setTimeout(() => setDownloading(false), 500);
      toast.success("Exportação iniciada.");
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || downloading}
      onClick={handleClick}
    >
      {pending || downloading ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {label}
    </Button>
  );
}
