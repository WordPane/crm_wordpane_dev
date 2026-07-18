"use client";

import { Loader2, MessageSquare, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommentItem } from "@/lib/queries/comments";
import { formatDateTime, initials, timeAgo } from "@/lib/utils/format";
import { createPortalComment } from "@/server/actions/portal";

/** Comentários da tarefa no portal: lista + caixa de novo comentário (sem exclusão). */
export function PortalTaskComments({
  taskId,
  comments,
}: {
  taskId: string;
  comments: CommentItem[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = body.trim();
    if (!value) return;

    startTransition(async () => {
      const result = await createPortalComment(taskId, { body: value });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setBody("");
      toast.success("Comentário enviado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <MessageSquare className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhum comentário ainda. Comece a conversa.
          </p>
        </div>
      ) : (
        <ul className="space-y-5">
          {comments.map((comment) => (
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
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Escreva um comentário..."
          rows={3}
          maxLength={5000}
          disabled={pending}
          aria-label="Novo comentário"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending || !body.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />}
            Comentar
          </Button>
        </div>
      </form>
    </div>
  );
}
