"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

const SidebarContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
} | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle: () => setOpen((v) => !v) }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
