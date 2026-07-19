"use client";

import {
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { UserRole } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/clientes", label: "Clientes", icon: Building2 },
  { href: "/admin/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/admin/demandas", label: "Demandas", icon: Inbox },
  { href: "/admin/tarefas", label: "Tarefas", icon: ListChecks },
  { href: "/admin/orcamentos", label: "Orçamentos", icon: FileText },
] as const;

const SUPER_ONLY_ITEMS = [
  { href: "/admin/cadastros", label: "Cadastros", icon: UserPlus },
  { href: "/admin/equipe", label: "Equipe", icon: Users },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AdminSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items =
    role === "super_admin" ? [...NAV_ITEMS, ...SUPER_ONLY_ITEMS] : NAV_ITEMS;

  return (
    <aside className="glass fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-white.png" alt="WordPane" className="h-7 w-auto" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[rgba(0,209,100,0.08)] text-[#00d164]"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <p className="text-[0.65rem] tracking-widest text-muted-foreground/50 uppercase">
          WordPane CRM · Admin
        </p>
      </div>
    </aside>
  );
}
