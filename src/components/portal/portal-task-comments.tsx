"use client";

import { CommentsSection } from "@/components/comments/comments-section";
import type { CommentItem, MentionableUser } from "@/lib/queries/comments";
import { createPortalComment } from "@/server/actions/portal";

/** Comentários da tarefa no portal: threads, respostas e menções (sem exclusão). */
export function PortalTaskComments({
  taskId,
  comments,
  mentionableUsers,
}: {
  taskId: string;
  comments: CommentItem[];
  mentionableUsers: MentionableUser[];
}) {
  return (
    <CommentsSection
      taskId={taskId}
      comments={comments}
      mentionableUsers={mentionableUsers}
      submitAction={createPortalComment}
    />
  );
}
