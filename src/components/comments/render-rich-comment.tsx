"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { sanitizeCommentHtml } from "@/lib/rich-text";

const URL_REGEX = /(https?:\/\/\S+)/;

function linkifyText(text: string, key: string): ReactNode {
  const parts = text.split(URL_REGEX);
  if (parts.length <= 1) return text;

  return (
    <Fragment key={key}>
      {parts.map((part, i) => {
        if (URL_REGEX.test(part)) {
          return (
            <a
              key={`${key}-url-${i}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <Fragment key={`${key}-txt-${i}`}>{part}</Fragment>;
      })}
    </Fragment>
  );
}

/**
 * Destaca menções informais (@nome / #tarefa) que aparecem como texto simples,
 * desde que o nome/título seja conhecido na lista de mencionáveis ou já
 * mencionados formalmente.
 */
function highlightMentions(
  text: string,
  key: string,
  knownNames: string[],
  knownTaskTitles: string[],
  taskHref: (taskId: string) => string,
  taskMentions: { id: string; title: string }[],
): ReactNode {
  // Ordena do maior para o menor para casar nomes compostos primeiro
  const names = [...knownNames].sort((a, b) => b.length - a.length);
  const titles = [...knownTaskTitles].sort((a, b) => b.length - a.length);

  const tokens: ReactNode[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const prev = i === 0 ? " " : text[i - 1];
    const isBoundary = /\s/.test(prev);

    if ((char === "@" || char === "#") && isBoundary) {
      const isTask = char === "#";
      const candidates = isTask ? titles : names;
      const matched = candidates.find((candidate) => {
        const end = i + 1 + candidate.length;
        const slice = text.slice(i + 1, end);
        const nextChar = text[end] ?? "";
        return (
          slice.toLowerCase() === candidate.toLowerCase() &&
          (nextChar === "" || /\s|[.,!?;:]/.test(nextChar))
        );
      });

      if (matched) {
        const end = i + 1 + matched.length;
        tokens.push(text.slice(0, i));
        const mentionKey = `${key}-mention-${i}`;
        if (isTask) {
          const task = taskMentions.find(
            (t) => t.title.toLowerCase() === matched.toLowerCase(),
          );
          if (task) {
            tokens.push(
              <Link
                key={mentionKey}
                href={taskHref(task.id)}
                className="mention mention-task inline-flex items-center gap-1 rounded-md bg-green/10 px-1 py-0.5 font-bold underline-offset-2 transition-colors hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                #{task.title}
              </Link>,
            );
          } else {
            tokens.push(
              <span
                key={mentionKey}
                className="mention mention-task rounded-md bg-green/10 px-1 py-0.5 font-bold"
              >
                #{matched}
              </span>,
            );
          }
        } else {
          tokens.push(
            <span
              key={mentionKey}
              className="mention mention-user rounded-md bg-green/10 px-1 py-0.5 font-bold"
            >
              @{matched}
            </span>,
          );
        }
        text = text.slice(end);
        i = 0;
        continue;
      }
    }

    i++;
  }

  if (tokens.length === 0) return linkifyText(text, key);

  return (
    <Fragment key={key}>
      {tokens.map((token, idx) =>
        typeof token === "string" && token.length > 0 ? (
          <Fragment key={`${key}-tok-${idx}`}>
            {linkifyText(token, `${key}-link-${idx}`)}
          </Fragment>
        ) : (
          <Fragment key={`${key}-tok-${idx}`}>{token}</Fragment>
        ),
      )}
    </Fragment>
  );
}

type RenderContext = { inAnchor: boolean };

type RenderRichCommentProps = {
  html: string;
  mentionNames: string[];
  taskMentions: { id: string; title: string }[];
  taskHref: (taskId: string) => string;
  /** Usuários que podem ser mencionados (para destacar @nome digitado manualmente). */
  knownUsers?: { name: string }[];
  /** Tarefas que podem ser mencionadas (para destacar #tarefa digitada manualmente). */
  knownTasks?: { title: string }[];
};

/**
 * Transforma um HTML de comentário em React nodes.
 * - Menções a usuários (`@nome`) ganham badge.
 * - Menções a tarefas (`#título`) viram Link.
 * - URLs soltas no texto viram link automaticamente.
 * - Demais tags são renderizadas como elementos React.
 */
export function renderRichComment(
  html: string,
  mentionNames: string[],
  taskMentions: { id: string; title: string }[],
  taskHref: (taskId: string) => string,
  knownUsers?: { name: string }[],
  knownTasks?: { title: string }[],
): ReactNode {
  const clean = sanitizeCommentHtml(html);
  if (!clean) return null;

  const knownNames = [
    ...new Set([
      ...mentionNames,
      ...(knownUsers?.map((u) => u.name) ?? []),
    ]),
  ];
  const knownTaskTitles = [
    ...new Set([
      ...taskMentions.map((t) => t.title),
      ...(knownTasks?.map((t) => t.title) ?? []),
    ]),
  ];

  // Durante o SSR o DOMParser não existe; renderizamos o HTML sanitizado
  // diretamente e deixamos as transformações ricas para o cliente.
  if (typeof DOMParser === "undefined") {
    return (
      <div
        className="text-sm leading-relaxed text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(clean, "text/html");

  function renderNode(
    node: Node,
    key: string,
    ctx: RenderContext = { inAnchor: false },
  ): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (ctx.inAnchor || !text.trim()) {
        return <Fragment key={key}>{text}</Fragment>;
      }
      return highlightMentions(
        text,
        key,
        knownNames,
        knownTaskTitles,
        taskHref,
        taskMentions,
      );
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const childCtx: RenderContext = tag === "a" ? { inAnchor: true } : ctx;
    const children = Array.from(el.childNodes).map((child, i) =>
      renderNode(child, `${key}-${i}`, childCtx),
    );

    if (tag === "span" && el.getAttribute("data-type") === "mention") {
      const kind = el.getAttribute("data-kind");
      const label = el.getAttribute("data-label") ?? el.textContent ?? "";
      if (kind === "task") {
        const taskId = el.getAttribute("data-id");
        const task = taskMentions.find((t) => t.id === taskId);
        if (!taskId || !task) {
          return (
            <span
              key={key}
              className="mention mention-task rounded-md bg-green/10 px-1 py-0.5 font-bold"
            >
              #{label}
            </span>
          );
        }
        return (
          <Link
            key={key}
            href={taskHref(taskId)}
            className="mention mention-task inline-flex items-center gap-1 rounded-md bg-green/10 px-1 py-0.5 font-bold underline-offset-2 transition-colors hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            #{task.title}
          </Link>
        );
      }
      return (
        <span
          key={key}
          className="mention mention-user rounded-md bg-green/10 px-1 py-0.5 font-bold"
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
          onClick={(e) => e.stopPropagation()}
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
    if (tag === "ul")
      return (
        <ul key={key} className="mb-2 list-disc pl-5">
          {children}
        </ul>
      );
    if (tag === "ol")
      return (
        <ol key={key} className="mb-2 list-decimal pl-5">
          {children}
        </ol>
      );
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
