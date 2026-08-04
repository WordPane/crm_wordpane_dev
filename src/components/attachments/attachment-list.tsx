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
import { uploadFile } from "@/lib/upload";
import { formatDateTime, formatFileSize } from "@/lib/utils/format";
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

function AttachmentCard({
  attachment,
  readOnly,
  currentUserId,
  currentUserRole,
  taskHrefBase,
  onDelete,
}: {
  attachment: AttachmentListItem;
  readOnly: boolean;
  currentUserId: string;
  currentUserRole: UserRole;
  taskHrefBase: string;
  onDelete: () => void;
}) {
  const Icon = fileIcon(attachment.mimeType);
  const canDelete =
    !readOnly &&
    (attachment.uploader?.id === currentUserId ||
      currentUserRole === "super_admin");

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl bg-white/[0.02] p-4 ring-1 ring-foreground/10 transition-colors hover:bg-white/[0.04]">
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Excluir ${attachment.fileName}`}
          className="absolute top-2 right-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          onClick={(e) => {
            e.preventDefault();
            onDelete();
          }}
        >
          <Trash2 />
        </Button>
      )}

      <a
        href={`/api/files/${attachment.id}`}
        className="flex flex-1 flex-col gap-3"
        title={attachment.fileName}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {attachment.fileName}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(attachment.fileSize)}
            </p>
          </div>
        </div>

        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p className="truncate">{attachment.uploader?.name ?? "—"}</p>
          <p>{formatDateTime(attachment.createdAt)}</p>
          {attachment.taskTitle && attachment.taskId && (
            <p className="truncate">
              <Link
                href={`${taskHrefBase}/${attachment.taskId}`}
                onClick={(e) => e.stopPropagation()}
                className="transition-colors hover:text-foreground"
              >
                {attachment.taskTitle}
              </Link>
            </p>
          )}
        </div>
      </a>
    </div>
  );
}

/** Lista de anexos com upload (uploadFile + createAttachment) e exclusão. */
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
      const uploaded = await uploadFile(file);

      const result = await createAction({
        fileKey: uploaded.fileKey,
        fileName: uploaded.fileName,
        fileSize: uploaded.fileSize,
        mimeType: uploaded.mimeType,
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
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o arquivo.",
      );
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
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {attachments.map((attachment) => (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                readOnly={readOnly}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                taskHrefBase={taskHrefBase}
                onDelete={() => setDeleting(attachment)}
              />
            ))}
          </div>
        </div>
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
