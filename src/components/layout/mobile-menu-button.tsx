"use client";

import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/layout/sidebar-context";

export function MobileMenuButton() {
  const { open, toggle } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="lg:hidden"
      onClick={toggle}
      aria-label={open ? "Fechar menu" : "Abrir menu"}
      aria-expanded={open}
    >
      {open ? <X /> : <Menu />}
    </Button>
  );
}
