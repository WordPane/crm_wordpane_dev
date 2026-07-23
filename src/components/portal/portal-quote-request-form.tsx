"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { File, Loader2, Paperclip, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile } from "@/lib/upload";
import { formatFileSize } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { PortalDemandAttachment } from "@/lib/validations/portal";
import {
  quoteRequestSchema,
  type QuoteRequestValues,
} from "@/lib/validations/quote";
import { createQuoteRequest } from "@/server/actions/quotes";

const MAX_FILES = 10;

function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Formulário de pedido de orçamento do cliente (com anexos opcionais). */
export function PortalQuoteRequestForm({
  services,
}: {
  services: { id: string; name: string; description: string | null }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<PortalDemandAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<QuoteRequestValues>({
    resolver: zodResolver(quoteRequestSchema),
    defaultValues: {
      title: "",
      serviceId: "",
      desiredDeadline: "",
      description: "",
    },
  });
  const { errors } = form.formState;

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    if (files.length + selected.length > MAX_FILES) {
      toast.error(`Máximo de ${MAX_FILES} arquivos por pedido.`);
      return;
    }

    setUploading(true);
    try {
      for (const file of selected) {
        try {
          const uploaded = await uploadFile(file);
          setFiles((prev) => [
            ...prev,
            {
              fileKey: uploaded.fileKey,
              fileName: uploaded.fileName,
              fileSize: uploaded.fileSize,
              mimeType: uploaded.mimeType,
            },
          ]);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : `Não foi possível enviar ${file.name}.`,
          );
        }
      }
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(values: QuoteRequestValues) {
    setError(null);
    startTransition(async () => {
      const result = await createQuoteRequest({ ...values, attachments: files });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Pedido de orçamento enviado.");
      router.push(
        result.id ? `/portal/orcamentos/${result.id}` : "/portal/orcamentos",
      );
    });
  }

  const busy = pending || uploading;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <Field label="Título *" htmlFor="qr-title" error={errors.title?.message}>
        <Input
          id="qr-title"
          placeholder="Ex.: Novo site para a campanha de fim de ano"
          aria-invalid={!!errors.title}
          {...form.register("title")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de serviço *" error={errors.serviceId?.message}>
          <Controller
            control={form.control}
            name="serviceId"
            render={({ field }) => {
              const selected = services.find((s) => s.id === field.value);
              return (
                <>
                  <Select
                    value={field.value || undefined}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={!!errors.serviceId}
                    >
                      <SelectValue placeholder="Selecione o tipo de serviço">
                        {(value: string | null) =>
                          !value
                            ? "Selecione o tipo de serviço"
                            : (services.find((s) => s.id === value)?.name ??
                              "Selecione o tipo de serviço")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selected?.description && (
                    <p className="text-xs text-muted-foreground">
                      {selected.description}
                    </p>
                  )}
                </>
              );
            }}
          />
        </Field>

        <Field
          label="Prazo desejado *"
          htmlFor="qr-deadline"
          error={errors.desiredDeadline?.message}
        >
          <Input
            id="qr-deadline"
            type="date"
            aria-invalid={!!errors.desiredDeadline}
            {...form.register("desiredDeadline")}
          />
        </Field>
      </div>

      <Field
        label="Descrição *"
        htmlFor="qr-description"
        error={errors.description?.message}
        hint="Quanto mais detalhes, mais precisa fica a proposta da equipe."
      >
        <Textarea
          id="qr-description"
          placeholder="Detalhe o projeto: objetivo, público, referências, páginas ou funcionalidades esperadas e qualquer material que você já tem..."
          rows={6}
          aria-invalid={!!errors.description}
          {...form.register("description")}
        />
      </Field>

      {/* ─── Anexos opcionais ─── */}
      <div className="space-y-2">
        <Label>Anexos (opcional)</Label>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={handleFiles}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || files.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
          {uploading ? "Enviando..." : "Adicionar arquivos"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Até {MAX_FILES} arquivos, 50 MB cada.
        </p>

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((file) => (
              <li
                key={file.fileKey}
                className="flex items-center gap-3 rounded-xl bg-white/[0.02] p-2.5 ring-1 ring-foreground/10"
              >
                <File className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {file.fileName}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatFileSize(file.fileSize)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remover ${file.fileName}`}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() =>
                    setFiles((prev) =>
                      prev.filter((f) => f.fileKey !== file.fileKey),
                    )
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar pedido
        </Button>
      </div>
    </form>
  );
}
