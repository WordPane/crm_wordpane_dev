"use client";

import {
  CalendarDays,
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Paperclip,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { brandAssetUrl, type BrandConfig } from "@/lib/brand/config";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/portal/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/portal/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/portal/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/portal/demandas", label: "Demandas", icon: Inbox },
  { href: "/portal/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/portal/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/portal/arquivos", label: "Arquivos", icon: Paperclip },
] as const;

// Item extra para o admin da empresa (entre "Demandas" e "Orçamentos")
const USERS_NAV_ITEM = {
  href: "/portal/usuarios",
  label: "Usuários",
  icon: Users,
} as const;

export function PortalSidebar({
  companyName,
  canManageUsers,
  brand,
}: {
  companyName: string;
  canManageUsers: boolean;
  brand: BrandConfig;
}) {
  const pathname = usePathname();
  const items = canManageUsers
    ? [...NAV_ITEMS.slice(0, 4), USERS_NAV_ITEM, ...NAV_ITEMS.slice(4)]
    : [...NAV_ITEMS];

  return (
    <aside className="glass fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={brandAssetUrl(brand, "logo")}
          alt={brand.appName}
          className="h-7 w-auto"
        />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
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
        <p className="truncate text-xs font-medium text-muted-foreground">
          {companyName}
        </p>
        <p className="text-[0.65rem] tracking-widest text-muted-foreground/50 uppercase">
          {brand.appName} · Portal
        </p>
      </div>
    </aside>
  );
}
