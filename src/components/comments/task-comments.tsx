"use client";

import { CommentsSection } from "@/components/comments/comments-section";
import type { UserRole } from "@/lib/auth/types";
import type { CommentItem, MentionableUser } from "@/lib/queries/comments";
import { createComment, deleteComment } from "@/server/actions/comments";

/** Comentários da tarefa (admin): threads, respostas, menções e exclusão. */
export function TaskComments({
  taskId,
  comments,
  currentUserId,
  currentUserRole,
  mentionableUsers,
}: {
  taskId: string;
  comments: CommentItem[];
  currentUserId: string;
  currentUserRole: UserRole;
  mentionableUsers: MentionableUser[];
}) {
  return (
    <CommentsSection
      taskId={taskId}
      comments={comments}
      mentionableUsers={mentionableUsers}
      submitAction={createComment}
      deleteAction={deleteComment}
      canDelete={(comment) =>
        comment.author?.id === currentUserId ||
        currentUserRole === "super_admin"
      }
    />
  );
}
