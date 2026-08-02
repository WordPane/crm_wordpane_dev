"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";

/**
 * Destaca nomes de tarefas/projetos (textos entre aspas) dentro de uma
 * notificação, tornando-os clicáveis quando houver um href. O clique no
 * nome não dispara o click geral do item (stopPropagation).
 */
export function NotificationText({
  text,
  href,
  className,
}: {
  text: string;
  href: string | null;
  className?: string;
}) {
  const router = useRouter();
  const targetHref = href;
  const matches = targetHref ? [...text.matchAll(/"([^"]+)"/g)] : [];
  if (matches.length === 0 || !targetHref) {
    return <span className={className}>{text}</span>;
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    const taskName = match[1];
    if (index > lastIndex) {
      nodes.push(
        <Fragment key={`t-${index}`}>{text.slice(lastIndex, index)}</Fragment>,
      );
    }
    nodes.push(
      <Fragment key={`q-${index}`}>&quot;</Fragment>,
      <span
        key={`l-${index}`}
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          router.push(targetHref);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            router.push(targetHref);
          }
        }}
        className="cursor-pointer font-medium text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
      >
        {taskName}
      </span>,
      <Fragment key={`r-${index}`}>&quot;</Fragment>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key="end">{text.slice(lastIndex)}</Fragment>);
  }

  return <span className={className}>{nodes}</span>;
}
