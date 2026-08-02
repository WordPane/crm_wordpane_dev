"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { sanitizeCommentHtml } from "@/lib/rich-text";

/**
 * Transforma um HTML de comentário em React nodes.
 * - Menções a usuários (`@nome`) ganham badge.
 * - Menções a tarefas (`#título`) viram Link.
 * - Demais tags são renderizadas como elementos React.
 */
export function renderRichComment(
  html: string,
  mentionNames: string[],
  taskMentions: { id: string; title: string }[],
  taskHref: (taskId: string) => string,
): ReactNode {
  const clean = sanitizeCommentHtml(html);
  if (!clean) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(clean, "text/html");

  function renderNode(node: Node, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
      return <Fragment key={key}>{node.textContent}</Fragment>;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const children = Array.from(el.childNodes).map((child, i) =>
      renderNode(child, `${key}-${i}`),
    );

    if (tag === "span" && el.getAttribute("data-type") === "mention") {
      const kind = el.getAttribute("data-kind");
      const label = el.getAttribute("data-label") ?? el.textContent ?? "";
      if (kind === "task") {
        const taskId = el.getAttribute("data-id");
        const task = taskMentions.find((t) => t.id === taskId);
        if (!taskId || !task) {
          return (
            <span key={key} className="mention mention-task">
              #{label}
            </span>
          );
        }
        return (
          <Link
            key={key}
            href={taskHref(taskId)}
            className="mention mention-task inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium text-primary underline-offset-2 transition-colors hover:text-primary/80 hover:underline"
          >
            #{task.title}
          </Link>
        );
      }
      return (
        <span
          key={key}
          className="mention mention-user rounded-md bg-primary/10 px-1 py-0.5 font-medium text-primary"
        >
          @{label}
        </span>
      );
    }

    // Links já vêm com target="_blank" do editor; mantemos.
    if (tag === "a") {
      return (
        <a
          key={key}
          href={el.getAttribute("href") ?? "#"}
          target={el.getAttribute("target") ?? "_blank"}
          rel={el.getAttribute("rel") ?? "noopener noreferrer"}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {children}
        </a>
      );
    }

    if (tag === "img") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={el.getAttribute("src") ?? ""}
          alt={el.getAttribute("alt") ?? ""}
          className="my-2 max-h-96 max-w-full rounded-lg object-contain"
        />
      );
    }

    if (tag === "p") {
      return (
        <p key={key} className="mb-2 last:mb-0">
          {children}
        </p>
      );
    }
    if (tag === "br") return <br key={key} />;
    if (tag === "strong" || tag === "b") {
      return <strong key={key}>{children}</strong>;
    }
    if (tag === "em" || tag === "i") {
      return <em key={key}>{children}</em>;
    }
    if (tag === "u") return <u key={key}>{children}</u>;
    if (tag === "ul") return <ul key={key} className="mb-2 list-disc pl-5">{children}</ul>;
    if (tag === "ol") return <ol key={key} className="mb-2 list-decimal pl-5">{children}</ol>;
    if (tag === "li") return <li key={key}>{children}</li>;

    return <span key={key}>{children}</span>;
  }

  return (
    <div className="text-sm leading-relaxed text-muted-foreground">
      {Array.from(doc.body.childNodes).map((node, i) =>
        renderNode(node, `root-${i}`),
      )}
    </div>
  );
}
