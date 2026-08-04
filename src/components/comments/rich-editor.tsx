"use client";

import {
  Bold,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { PluginKey } from "@tiptap/pm/state";

import { Button } from "@/components/ui/button";
import type { MentionableUser } from "@/lib/queries/comments";
import { cn } from "@/lib/utils";

export type MentionableTask = {
  id: string;
  title: string;
};

export type RichEditorSubmit = {
  html: string;
  mentions: string[];
  taskMentions: string[];
};

const mentionPluginKey = new PluginKey("mention");
const taskMentionPluginKey = new PluginKey("taskMention");

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function setLink(editor: Editor) {
  const previousUrl = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("URL do link", previousUrl ?? "https://");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function insertImage(editor: Editor, upload: (file: File) => Promise<string>) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await upload(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      window.alert("Falha ao enviar imagem.");
    }
  };
  input.click();
}

/**
 * Sanitização leve no cliente: remove scripts e tags perigosas.
 * A sanitização definitiva ocorre na server action.
 */
function sanitizeHtml(html: string): string {
  const allowed = new Set([
    "P",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "A",
    "IMG",
    "UL",
    "OL",
    "LI",
    "SPAN",
  ]);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (!allowed.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes));
        return;
      }
      if (el.tagName === "A") {
        const href = el.getAttribute("href") ?? "";
        if (!/^https?:\/\//i.test(href)) {
          el.removeAttribute("href");
        } else {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (el.tagName === "IMG") {
        const src = el.getAttribute("src") ?? "";
        if (!/^https?:\/\//i.test(src)) {
          el.removeAttribute("src");
        }
        el.removeAttribute("onerror");
        el.removeAttribute("onload");
      }
      if (el.tagName === "SPAN") {
        const type = el.getAttribute("data-type");
        if (type && type !== "mention") {
          el.replaceWith(...Array.from(el.childNodes));
          return;
        }
      }
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) el.removeAttribute(attr.name);
      });
      Array.from(el.childNodes).forEach(walk);
    }
  };
  Array.from(doc.body.childNodes).forEach(walk);
  return doc.body.innerHTML;
}

function extractMentions(html: string): {
  mentions: string[];
  taskMentions: string[];
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const mentions: string[] = [];
  const taskMentions: string[] = [];
  doc.querySelectorAll("span[data-type='mention']").forEach((el) => {
    const id = el.getAttribute("data-id");
    const kind = el.getAttribute("data-kind");
    if (!id) return;
    if (kind === "task") taskMentions.push(id);
    else mentions.push(id);
  });
  return { mentions, taskMentions };
}

type SuggestionItem = { id: string; label: string; role?: string };

type SuggestionState = {
  items: SuggestionItem[];
  query: string;
  kind: "user" | "task";
};

function createMentionSuggestion(
  kind: "user" | "task",
  getItems: (query: string) => SuggestionItem[],
  onStateChange: (state: SuggestionState | null) => void,
  onRangeChange: (range: { from: number; to: number } | null) => void,
) {
  return {
    char: kind === "user" ? "@" : "#",
    pluginKey: kind === "user" ? mentionPluginKey : taskMentionPluginKey,
    items: ({ query }: { query: string }) => getItems(query),
    render: () => {
      return {
        onStart: (props: { query: string; range: { from: number; to: number } }) => {
          onRangeChange(props.range);
          onStateChange({ items: getItems(props.query), query: props.query, kind });
        },
        onUpdate: (props: { query: string; range: { from: number; to: number } }) => {
          onRangeChange(props.range);
          onStateChange({ items: getItems(props.query), query: props.query, kind });
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
          return props.event.key === "Escape";
        },
        onExit: () => {
          onRangeChange(null);
          onStateChange(null);
        },
      };
    },
  };
}

export function RichCommentEditor({
  users,
  tasks,
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
  pending,
  uploadImage,
}: {
  users: MentionableUser[];
  tasks: MentionableTask[];
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (value: RichEditorSubmit) => void;
  onCancel?: () => void;
  pending: boolean;
  uploadImage: (file: File) => Promise<string>;
}) {
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const mentionRangeRef = useRef<{ from: number; to: number } | null>(null);

  const userItems = useCallback(
    (query: string) =>
      users
        .filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
        .map((u) => ({ id: u.id, label: u.name, role: u.role })),
    [users],
  );

  const taskItems = useCallback(
    (query: string) =>
      tasks
        .filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
        .map((t) => ({ id: t.id, label: t.title })),
    [tasks],
  );

  const handleSuggestionChange = useCallback((state: SuggestionState | null) => {
    setSuggestion(state);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
      }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true }),
      Placeholder.configure({ placeholder }),
      Mention.extend({ name: "userMention" }).configure({
        HTMLAttributes: { class: "mention mention-user" },
        suggestion: createMentionSuggestion("user", userItems, handleSuggestionChange, (range) => {
          mentionRangeRef.current = range;
        }),
      }),
      Mention.extend({ name: "taskMention" }).configure({
        HTMLAttributes: { class: "mention mention-task" },
        suggestion: createMentionSuggestion("task", taskItems, handleSuggestionChange, (range) => {
          mentionRangeRef.current = range;
        }),
      }),
    ],
    content: "",
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class:
          "min-h-[96px] max-h-[320px] overflow-y-auto rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
      },
    },
  });

  const submit = useCallback(() => {
    if (pending) return;
    const editor = editorRef.current;
    if (!editor) return;
    const html = sanitizeHtml(editor.getHTML());
    const text = editor.getText().trim();
    if (!text && !html.includes("<img")) return;
    const { mentions, taskMentions } = extractMentions(html);
    onSubmit({ html, mentions, taskMentions });
    editor.commands.clearContent(true);
    setSuggestion(null);
  }, [pending, onSubmit]);

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSuggestion(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    };
    const el = editor.view.dom;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [editor, submit]);

  if (!editor) return null;

  function selectMention(item: SuggestionItem) {
    const kind = suggestion?.kind ?? "user";
    const nodeType = kind === "user" ? "userMention" : "taskMention";
    const range = mentionRangeRef.current ?? editor.state.selection;
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        {
          type: nodeType,
          attrs: { id: item.id, label: item.label, kind },
        },
        { type: "text", text: " " },
      ])
      .run();
    mentionRangeRef.current = null;
    setSuggestion(null);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <EditorContent editor={editor} disabled={pending} />
        {suggestion && (
          <div className="absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-lg bg-popover py-1 shadow-md ring-1 ring-foreground/10">
            {suggestion.items.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-muted-foreground">
                Nenhum resultado
              </p>
            ) : (
              suggestion.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(item);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.role === "client" && (
                    <span className="text-xs text-amber-300">Cliente</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <ToolbarButton
            title="Negrito"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Itálico"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Link"
            active={editor.isActive("link")}
            onClick={() => setLink(editor)}
          >
            <LinkIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Lista"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Lista numerada"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Imagem"
            onClick={() => insertImage(editor, uploadImage)}
          >
            <ImageIcon className="size-4" />
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Use @ para pessoas e # para tarefas
          </p>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onCancel}
            >
              <X className="size-4" />
              Cancelar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={
              pending ||
              (!editor.getText().trim() && !editor.getHTML().includes("<img"))
            }
            onClick={submit}
          >
            {pending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
