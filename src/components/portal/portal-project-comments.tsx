"use client";

import { CommentsSection } from "@/components/comments/comments-section";
import type { CommentItem, MentionableUser } from "@/lib/queries/comments";
import { createPortalProjectComment } from "@/server/actions/portal";

/** Comentários em nível de projeto (portal do cliente). */
export function PortalProjectComments({
  projectId,
  comments,
  mentionableUsers,
  mentionableTasks,
}: {
  projectId: string;
  comments: CommentItem[];
  mentionableUsers: MentionableUser[];
  mentionableTasks: { id: string; title: string }[];
}) {
  return (
    <CommentsSection
      projectId={projectId}
      comments={comments}
      mentionableUsers={mentionableUsers}
      mentionableTasks={mentionableTasks}
      submitAction={createPortalProjectComment}
      taskHref={(taskId) => `/portal/projetos/${projectId}/tarefas/${taskId}`}
    />
  );
}
