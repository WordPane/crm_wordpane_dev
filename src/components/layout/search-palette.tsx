"use client";

import {
  Building2,
  FolderKanban,
  Inbox,
  ListChecks,
  Paperclip,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { SearchResults } from "@/app/api/search/route";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const GROUPS: { key: keyof SearchResults; label: string; icon: LucideIcon }[] = [
  { key: "companies", label: "Clientes", icon: Building2 },
  { key: "projects", label: "Projetos", icon: FolderKanban },
  { key: "tasks", label: "Tarefas", icon: ListChecks },
  { key: "demands", label: "Demandas", icon: Inbox },
  { key: "users", label: "Equipe", icon: Users },
  { key: "files", label: "Arquivos", icon: Paperclip },
];

const EMPTY_RESULTS: SearchResults = {
  companies: [],
  projects: [],
  tasks: [],
  demands: [],
  users: [],
  files: [],
};

/** Pesquisa global do admin — botão no header + atalho Cmd/Ctrl+K. */
export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  // Atalho global Cmd+K / Ctrl+K
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Busca com debounce de 300ms (setState apenas dentro do callback)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : EMPTY_RESULTS))
        .then((data: SearchResults) => setResults(data))
        .catch(() => setResults(EMPTY_RESULTS))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setResults(null);
    }
  }

  function navigate(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  const trimmed = query.trim();
  // Resultados ficam mascarados enquanto a busca tem menos de 2 caracteres
  const visibleResults = trimmed.length < 2 ? null : results;
  const emptyMessage =
    trimmed.length < 2
      ? "Digite pelo menos 2 caracteres para buscar."
      : loading || visibleResults === null
        ? "Buscando…"
        : `Nenhum resultado para "${trimmed}".`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar (⌘K)"
        className="flex h-9 items-center gap-2 rounded-lg border border-input/50 bg-white/[0.03] px-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.06] sm:w-56 lg:w-64"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Pesquisa global"
        description="Busque clientes, projetos, tarefas, demandas, equipe e arquivos."
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar clientes, projetos, tarefas…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {GROUPS.map(({ key, label, icon: Icon }) => {
              const items = visibleResults?.[key] ?? [];
              if (items.length === 0) return null;
              return (
                <CommandGroup key={key} heading={label}>
                  {items.map((item) => (
                    <CommandItem
                      key={`${key}-${item.id}`}
                      value={`${key}-${item.id}-${item.title}`}
                      onSelect={() => navigate(item.href)}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="max-w-40 truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
