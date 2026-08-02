"use client";

import { CommentsSection } from "@/components/comments/comments-section";
import type { CommentItem, MentionableUser } from "@/lib/queries/comments";
import { createPortalComment } from "@/server/actions/portal";

/** Comentários da tarefa no portal: threads, respostas e menções (sem exclusão). */
export function PortalTaskComments({
  taskId,
  projectId,
  comments,
  mentionableUsers,
  mentionableTasks,
}: {
  taskId: string;
  projectId: string;
  comments: CommentItem[];
  mentionableUsers: MentionableUser[];
  mentionableTasks: { id: string; title: string }[];
}) {
  return (
    <CommentsSection
      taskId={taskId}
      comments={comments}
      mentionableUsers={mentionableUsers}
      mentionableTasks={mentionableTasks}
      submitAction={createPortalComment}
      taskHref={(taskId) => `/portal/projetos/${projectId}/tarefas/${taskId}`}
    />
  );
}
