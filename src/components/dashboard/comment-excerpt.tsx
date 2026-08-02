"use client";

import { renderRichComment } from "@/components/comments/render-rich-comment";

type DashboardCommentExcerptProps = {
  body: string;
  mentionNames: string[];
  taskMentions: { id: string; title: string }[];
};

export function CommentExcerpt({
  body,
  mentionNames,
  taskMentions,
}: DashboardCommentExcerptProps) {
  return (
    <div className="line-clamp-2 text-sm text-muted-foreground [&_img]:hidden">
      {renderRichComment(
        body,
        mentionNames,
        taskMentions,
        (taskId) => `/admin/tarefas/${taskId}`,
      )}
    </div>
  );
}
