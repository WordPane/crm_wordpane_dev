"use client";

import { Columns3, List } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ViewMode = "lista" | "kanban";

/** Alternador lista ⇄ kanban (preferência persistida pelo useViewPreference). */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-lg p-0.5 ring-1 ring-border">
      <Button
        variant={value === "lista" ? "secondary" : "ghost"}
        size="icon-xs"
        aria-label="Visualização em lista"
        title="Lista"
        onClick={() => onChange("lista")}
      >
        <List className="size-4" />
      </Button>
      <Button
        variant={value === "kanban" ? "secondary" : "ghost"}
        size="icon-xs"
        aria-label="Visualização em kanban"
        title="Kanban"
        onClick={() => onChange("kanban")}
      >
        <Columns3 className="size-4" />
      </Button>
    </div>
  );
}
