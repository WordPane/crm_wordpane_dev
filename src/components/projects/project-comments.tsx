"use client";

import { CommentsSection } from "@/components/comments/comments-section";
import type { UserRole } from "@/lib/auth/types";
import type { CommentItem, MentionableUser } from "@/lib/queries/comments";
import { createProjectComment, deleteComment } from "@/server/actions/comments";

/** Comentários em nível de projeto (admin): threads, respostas, menções e exclusão. */
export function ProjectComments({
  projectId,
  comments,
  currentUserId,
  currentUserRole,
  mentionableUsers,
  mentionableTasks,
}: {
  projectId: string;
  comments: CommentItem[];
  currentUserId: string;
  currentUserRole: UserRole;
  mentionableUsers: MentionableUser[];
  mentionableTasks: { id: string; title: string }[];
}) {
  return (
    <CommentsSection
      projectId={projectId}
      comments={comments}
      mentionableUsers={mentionableUsers}
      mentionableTasks={mentionableTasks}
      submitAction={createProjectComment}
      deleteAction={deleteComment}
      canDelete={(comment) =>
        comment.author?.id === currentUserId || currentUserRole === "super_admin"
      }
      taskHref={(taskId) => `/admin/tarefas/${taskId}`}
    />
  );
}
