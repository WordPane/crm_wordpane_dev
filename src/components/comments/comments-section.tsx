"use client";

import { MessageSquare, Reply, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { renderRichComment } from "@/components/comments/render-rich-comment";
import { RichCommentEditor } from "@/components/comments/rich-editor";
import { uploadCommentImage } from "@/components/comments/upload-image";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { CommentItem, MentionableUser } from "@/lib/queries/comments";
import { formatDateTime, initials, timeAgo } from "@/lib/utils/format";

export type CommentActionResult =
  | { success: true; id?: string }
  | { error: string };

type MentionableTask = {
  id: string;
  title: string;
};

type CommentsSectionProps = {
  taskId?: string;
  projectId?: string;
  comments: CommentItem[];
  mentionableUsers: MentionableUser[];
  mentionableTasks: MentionableTask[];
  submitAction: (scopeId: string, input: unknown) => Promise<CommentActionResult>;
  /** Exclusão habilitada quando ambos são informados. */
  deleteAction?: (commentId: string) => Promise<CommentActionResult>;
  canDelete?: (comment: CommentItem) => boolean;
  taskHref: (taskId: string) => string;
};

// ─────────────────────────── Seção de comentários (threads) ───────────────────────────

export function CommentsSection({
  taskId,
  projectId,
  comments,
  mentionableUsers,
  mentionableTasks,
  submitAction,
  deleteAction,
  canDelete,
  taskHref,
}: CommentsSectionProps) {
  const scopeId = (taskId ?? projectId)!;
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [deleting, setDeleting] = useState<CommentItem | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parentId === id);

  function submit(
    input: { html: string; mentions: string[]; taskMentions: string[] },
    parentId?: string,
  ) {
    startTransition(async () => {
      const result = await submitAction(scopeId, {
        body: input.html,
        mentions: input.mentions,
        taskMentions: input.taskMentions,
        parentId: parentId ?? "",
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setReplyTo(null);
      toast.success("Comentário enviado.");
      router.refresh();
    });
  }

  function renderComment(comment: CommentItem, replyToRoot?: CommentItem) {
    const rootId = comment.parentId ?? comment.id;
    const deletable =
      deleteAction && canDelete ? canDelete(comment) : false;

    return (
      <li key={comment.id} className="flex items-start gap-3">
        <Avatar>
          {comment.author?.avatarUrl && (
            <AvatarImage
              src={comment.author.avatarUrl}
              alt={comment.author.name}
            />
          )}
          <AvatarFallback>
            {comment.author ? initials(comment.author.name) : "?"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {comment.author?.name ?? "Usuário removido"}
            </span>
            {comment.author?.role === "client" && (
              <span className="chip border-amber-400/30 bg-amber-400/10 text-amber-300">
                Cliente
              </span>
            )}
            <span
              className="text-xs text-muted-foreground"
              title={formatDateTime(comment.createdAt)}
            >
              {timeAgo(comment.createdAt)}
            </span>
            <div className="ml-auto flex items-center">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Responder comentário de ${comment.author?.name ?? "usuário"}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setReplyTo(replyTo?.id === comment.id ? null : comment)
                }
              >
                <Reply />
              </Button>
              {deletable && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Excluir comentário"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(comment)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>

          {replyToRoot && (
            <p className="text-xs text-muted-foreground/70">
              Em resposta a {replyToRoot.author?.name ?? "usuário"}
            </p>
          )}

          {renderRichComment(
            comment.body,
            comment.mentionNames,
            comment.taskMentions,
            taskHref,
          )}

          {replyTo?.id === comment.id && (
            <div className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10">
              <p className="mb-2 text-xs text-muted-foreground">
                Respondendo a {comment.author?.name ?? "usuário"}
              </p>
              <RichCommentEditor
                users={mentionableUsers}
                tasks={mentionableTasks}
                placeholder="Escreva sua resposta..."
                submitLabel="Responder"
                autoFocus
                onSubmit={(input) => submit(input, rootId)}
                onCancel={() => setReplyTo(null)}
                pending={pending}
                uploadImage={uploadCommentImage}
              />
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      {roots.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <MessageSquare className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhum comentário ainda. Comece a conversa.
          </p>
        </div>
      ) : (
        <ul className="space-y-5">
          {roots.map((root) => (
            <li key={root.id} className="space-y-4">
              <ul>{[renderComment(root)]}</ul>
              {repliesOf(root.id).length > 0 && (
                <ul className="ml-9 space-y-4 border-l border-border pl-5">
                  {repliesOf(root.id).map((reply) =>
                    renderComment(reply, byId.get(root.id)),
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <RichCommentEditor
        users={mentionableUsers}
        tasks={mentionableTasks}
        placeholder="Escreva um comentário..."
        submitLabel="Comentar"
        onSubmit={(input) => submit(input)}
        pending={pending}
        uploadImage={uploadCommentImage}
      />

      {deleteAction && (
        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          title="Excluir comentário"
          description="Tem certeza que deseja excluir este comentário? Esta ação não pode ser desfeita."
          onConfirm={async () => {
            if (!deleting) return null;
            const result = await deleteAction(deleting.id);
            if ("error" in result) return result.error;
            toast.success("Comentário excluído.");
            router.refresh();
            return null;
          }}
        />
      )}
    </div>
  );
}
