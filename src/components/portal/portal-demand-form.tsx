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
import {
  demandCategories,
  demandCategoryLabels,
} from "@/lib/validations/demand";
import {
  portalDemandSchema,
  type PortalDemandAttachment,
  type PortalDemandValues,
} from "@/lib/validations/portal";
import { priorities, priorityLabels } from "@/lib/validations/project";
import { createPortalDemand } from "@/server/actions/portal";

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

/** Formulário de nova demanda do cliente (com anexos opcionais). */
export function PortalDemandForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<PortalDemandAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<PortalDemandValues>({
    resolver: zodResolver(portalDemandSchema),
    defaultValues: {
      projectId: "",
      title: "",
      category: "" as PortalDemandValues["category"],
      priority: "" as PortalDemandValues["priority"],
      description: "",
    },
  });
  const { errors } = form.formState;

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    if (files.length + selected.length > MAX_FILES) {
      toast.error(`Máximo de ${MAX_FILES} arquivos por demanda.`);
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

  function onSubmit(values: PortalDemandValues) {
    setError(null);
    startTransition(async () => {
      const result = await createPortalDemand({ ...values, attachments: files });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Demanda enviada com sucesso.");
      router.push("/portal/demandas");
    });
  }

  const busy = pending || uploading;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <Field
        label="Projeto *"
        error={errors.projectId?.message}
        hint="A demanda será vinculada a este projeto."
      >
        <Controller
          control={form.control}
          name="projectId"
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={(value) => field.onChange(value)}
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.projectId}>
                <SelectValue placeholder="Selecione o projeto">
                  {(value: string | null) =>
                    !value
                      ? "Selecione o projeto"
                      : (projects.find((p) => p.id === value)?.name ??
                        "Selecione o projeto")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <Field label="Título *" htmlFor="dm-title" error={errors.title?.message}>
        <Input
          id="dm-title"
          placeholder="Ex.: Ajustar formulário de contato do site"
          aria-invalid={!!errors.title}
          {...form.register("title")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoria *" error={errors.category?.message}>
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger className="w-full" aria-invalid={!!errors.category}>
                  <SelectValue placeholder="Selecione a categoria">
                    {(value: string | null) => {
                      if (!value) return "Selecione a categoria";
                      const c = demandCategories.find((c) => c === value);
                      return c
                        ? demandCategoryLabels[c]
                        : "Selecione a categoria";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {demandCategories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {demandCategoryLabels[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field label="Prioridade *" error={errors.priority?.message}>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger className="w-full" aria-invalid={!!errors.priority}>
                  <SelectValue placeholder="Selecione a prioridade">
                    {(value: string | null) => {
                      if (!value) return "Selecione a prioridade";
                      const p = priorities.find((p) => p === value);
                      return p ? priorityLabels[p] : "Selecione a prioridade";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priorityLabels[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <Field
        label="Descrição *"
        htmlFor="dm-description"
        error={errors.description?.message}
        hint="Conte o que você precisa com ao menos 20 caracteres."
      >
        <Textarea
          id="dm-description"
          placeholder="Descreva a demanda, o contexto e o resultado esperado..."
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
          Enviar demanda
        </Button>
      </div>
    </form>
  );
}
