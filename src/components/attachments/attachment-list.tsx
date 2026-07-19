"use client";

import {
  File,
  FileArchive,
  FileImage,
  FileText,
  FileVideo,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/auth/types";
import type { AttachmentItem } from "@/lib/queries/attachments";
import { formatFileSize, timeAgo } from "@/lib/utils/format";
import {
  createAttachment,
  deleteAttachment,
} from "@/server/actions/attachments";

type AttachmentListItem = AttachmentItem & { taskTitle?: string };

type AttachmentListProps = {
  attachments: AttachmentListItem[];
  /** Alvo de novos uploads (exatamente um). Obrigatório salvo em readOnly. */
  taskId?: string;
  projectId?: string;
  demandId?: string;
  currentUserId: string;
  currentUserRole: UserRole;
  /** Somente leitura: esconde upload e exclusão (anexos das tarefas do projeto). */
  readOnly?: boolean;
  /** Ações customizadas (o portal do cliente usa ações client-safe). */
  createAction?: typeof createAttachment;
  deleteAction?: typeof deleteAttachment;
  /** Base do link da tarefa de origem (padrão: /admin/tarefas). */
  taskHrefBase?: string;
};

function fileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.includes("zip")) return FileArchive;
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet")
  ) {
    return FileText;
  }
  return File;
}

/** Lista de anexos com upload (POST /api/upload + createAttachment) e exclusão. */
export function AttachmentList({
  attachments,
  taskId,
  projectId,
  demandId,
  currentUserId,
  currentUserRole,
  readOnly = false,
  createAction = createAttachment,
  deleteAction = deleteAttachment,
  taskHrefBase = "/admin/tarefas",
}: AttachmentListProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<AttachmentListItem | null>(null);
  const [, startTransition] = useTransition();

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        fileKey?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
      } | null;
      if (!response.ok || !payload?.fileKey) {
        toast.error(payload?.error ?? "Não foi possível enviar o arquivo.");
        return;
      }

      const result = await createAction({
        fileKey: payload.fileKey,
        fileName: payload.fileName ?? file.name,
        fileSize: payload.fileSize ?? file.size,
        mimeType: payload.mimeType ?? file.type,
        taskId: taskId ?? "",
        projectId: projectId ?? "",
        demandId: demandId ?? "",
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Arquivo anexado.");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? "Enviando..." : "Anexar arquivo"}
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Máximo de 50 MB por arquivo.
          </p>
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Paperclip className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhum arquivo anexado.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => {
            const Icon = fileIcon(attachment.mimeType);
            const canDelete =
              !readOnly &&
              (attachment.uploader?.id === currentUserId ||
                currentUserRole === "super_admin");
            return (
              <li
                key={attachment.id}
                className="flex items-center gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/files/${attachment.id}`}
                    className="block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {attachment.fileName}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileSize)}
                    {" · "}
                    {attachment.uploader?.name ?? "—"}
                    {" · "}
                    <span title={attachment.createdAt.toISOString()}>
                      {timeAgo(attachment.createdAt)}
                    </span>
                    {attachment.taskTitle && attachment.taskId && (
                      <>
                        {" · "}
                        <Link
                          href={`${taskHrefBase}/${attachment.taskId}`}
                          className="transition-colors hover:text-foreground"
                        >
                          {attachment.taskTitle}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Excluir ${attachment.fileName}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleting(attachment)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir arquivo"
        description={`Tem certeza que deseja excluir "${deleting?.fileName}"? O arquivo será removido permanentemente.`}
        onConfirm={async () => {
          if (!deleting) return null;
          const result = await deleteAction(deleting.id);
          if ("error" in result) return result.error;
          toast.success("Arquivo excluído.");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
