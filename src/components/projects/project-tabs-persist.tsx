"use client";

import { useState } from "react";

import { Tabs } from "@/components/ui/tabs";
import { useViewPreference } from "@/lib/use-view-preference";

const STORAGE_KEY = "view:project-tab";

/**
 * Abas do projeto lembrando a última visitada (persistida no navegador).
 * Link com ?tab= explícito vence e também vira a última lembrada.
 */
export function ProjectTabsPersist({
  initialTab,
  hasExplicitTab,
  children,
}: {
  initialTab: string;
  hasExplicitTab: boolean;
  children: React.ReactNode;
}) {
  const [storedTab, setStoredTab] = useViewPreference(STORAGE_KEY, "visao");
  const [override, setOverride] = useState<string | null>(null);

  const tab = override ?? (hasExplicitTab ? initialTab : storedTab);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setOverride(value);
        setStoredTab(value);
      }}
    >
      {children}
    </Tabs>
  );
}
