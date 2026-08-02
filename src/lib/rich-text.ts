import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitiza HTML de comentários ricos.
 * Permite apenas formatação básica, links, imagens e menções.
 */
export function sanitizeCommentHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "a",
      "img",
      "ul",
      "ol",
      "li",
      "span",
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "src",
      "alt",
      "class",
      "data-id",
      "data-label",
      "data-kind",
      "data-type",
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style", "onclick", "onerror", "onload"],
  });
}

/**
 * Extrai menções de usuários (@) e tarefas (#) do HTML sanitizado.
 * As menções do TipTap são renderizadas como:
 * <span data-type="mention" data-id="..." data-label="..." data-kind="user|task">...</span>
 */
export function extractMentionsFromHtml(html: string): {
  mentions: string[];
  taskMentions: string[];
} {
  const mentions: string[] = [];
  const taskMentions: string[] = [];

  // Regex segura: não executa o conteúdo, apenas extrai atributos
  const regex =
    /<span[^>]*data-type=["']mention["'][^>]*data-id=["']([^"']+)["'][^>]*data-kind=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    const kind = match[2];
    if (kind === "task") taskMentions.push(id);
    else mentions.push(id);
  }

  return { mentions, taskMentions };
}

/** Verifica se o HTML sanitizado tem algum conteúdo visível. */
export function isEmptyHtml(html: string): boolean {
  const text = html.replace(/<[^>]+>/g, "").trim();
  return text.length === 0 && !html.includes("<img");
}
