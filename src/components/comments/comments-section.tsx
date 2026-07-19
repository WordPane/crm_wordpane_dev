"use client";

import { Loader2, MessageSquare, Reply, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommentItem, MentionableUser } from "@/lib/queries/comments";
import { formatDateTime, initials, timeAgo } from "@/lib/utils/format";

export type CommentActionResult =
  | { success: true; id?: string }
  | { error: string };

type CommentsSectionProps = {
  taskId: string;
  comments: CommentItem[];
  mentionableUsers: MentionableUser[];
  submitAction: (taskId: string, input: unknown) => Promise<CommentActionResult>;
  /** Exclusão habilitada quando ambos são informados. */
  deleteAction?: (commentId: string) => Promise<CommentActionResult>;
  canDelete?: (comment: CommentItem) => boolean;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Corpo do comentário com @menções destacadas. */
function renderCommentBody(body: string, mentionNames: string[]): ReactNode {
  if (mentionNames.length === 0) return body;
  const pattern = new RegExp(
    `(@(?:${mentionNames.map(escapeRegex).join("|")}))`,
    "g",
  );
  return body.split(pattern).map((part, index) => {
    if (part.startsWith("@") && mentionNames.includes(part.slice(1))) {
      return (
        <span
          key={index}
          className="rounded-md bg-primary/10 px-1 py-0.5 font-medium text-primary"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

// ─────────────────────────── Formulário com autocomplete de @ ───────────────────────────

function CommentForm({
  users,
  pending,
  placeholder,
  submitLabel,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  users: MentionableUser[];
  pending: boolean;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (input: { body: string; mentions: string[] }) => void;
  onCancel?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<Map<string, string>>(new Map());
  const [suggest, setSuggest] = useState<{ query: string; start: number } | null>(null);

  const filtered = useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.trim().toLowerCase();
    return users
      .filter((u) => !q || u.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [suggest, users]);

  function handleChange(value: string, caret: number) {
    setBody(value);
    const before = value.slice(0, caret);
    const match = before.match(/@([\p{L}\p{N} .'-]{0,30})$/u);
    setSuggest(match ? { query: match[1], start: caret - match[1].length } : null);
  }

  function insertMention(user: MentionableUser) {
    if (!suggest || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? body.length;
    const before = body.slice(0, suggest.start); // inclui o "@"
    const after = body.slice(caret);
    setBody(`${before}${user.name} ${after}`);
    setMentionIds((prev) => new Map(prev).set(user.id, user.name));
    setSuggest(null);
    textareaRef.current.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggest && filtered.length > 0 && event.key === "Enter") {
      event.preventDefault();
      insertMention(filtered[0]);
    }
    if (event.key === "Escape") setSuggest(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = body.trim();
    if (!value) return;
    // Só envia menções cujo @nome ainda está no texto
    const mentions = [...mentionIds.entries()]
      .filter(([, name]) => value.includes(`@${name}`))
      .map(([id]) => id);
    onSubmit({ body: value, mentions });
    setBody("");
    setMentionIds(new Map());
    setSuggest(null);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(event) =>
            handleChange(event.target.value, event.target.selectionStart)
          }
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          maxLength={5000}
          disabled={pending}
          autoFocus={autoFocus}
          aria-label="Comentário"
        />
        {suggest && filtered.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg bg-popover py-1 shadow-md ring-1 ring-foreground/10">
            {filtered.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(user);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                  {user.role === "client" && (
                    <span className="text-xs text-amber-300">Cliente</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Use @ para mencionar alguém
        </p>
        <div className="flex gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onCancel}
            >
              <X />
              Cancelar
            </Button>
          )}
          <Button type="submit" size="sm" disabled={pending || !body.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────── Seção de comentários (threads) ───────────────────────────

export function CommentsSection({
  taskId,
  comments,
  mentionableUsers,
  submitAction,
  deleteAction,
  canDelete,
}: CommentsSectionProps) {
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [deleting, setDeleting] = useState<CommentItem | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) =>
    comments.filter((c) => c.parentId === id);

  function submit(input: { body: string; mentions: string[] }, parentId?: string) {
    startTransition(async () => {
      const result = await submitAction(taskId, {
        body: input.body,
        mentions: input.mentions,
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

          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {renderCommentBody(comment.body, comment.mentionNames)}
          </p>

          {replyTo?.id === comment.id && (
            <div className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10">
              <p className="mb-2 text-xs text-muted-foreground">
                Respondendo a {comment.author?.name ?? "usuário"}
              </p>
              <CommentForm
                users={mentionableUsers}
                pending={pending}
                placeholder="Escreva sua resposta..."
                submitLabel="Responder"
                autoFocus
                onSubmit={(input) => submit(input, rootId)}
                onCancel={() => setReplyTo(null)}
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

      <CommentForm
        users={mentionableUsers}
        pending={pending}
        placeholder="Escreva um comentário..."
        submitLabel="Comentar"
        onSubmit={(input) => submit(input)}
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
