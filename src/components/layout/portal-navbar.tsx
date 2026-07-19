"use client";

import {
  FileText,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  Menu,
  Paperclip,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  NotificationBell,
  type NotificationBellItem,
} from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/portal/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/portal/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/portal/demandas", label: "Demandas", icon: Inbox },
  { href: "/portal/orcamentos", label: "Orçamentos", icon: FileText },
  { href: "/portal/arquivos", label: "Arquivos", icon: Paperclip },
  { href: "/portal/perfil", label: "Perfil", icon: UserRound },
] as const;

// Item extra para o admin da empresa (entre "Demandas" e "Orçamentos")
const USERS_NAV_ITEM = {
  href: "/portal/usuarios",
  label: "Usuários",
  icon: Users,
} as const;

export function PortalNavbar({
  userName,
  userEmail,
  userImage,
  companyName,
  unreadNotifications,
  notifications,
  canManageUsers,
}: {
  userName: string;
  userEmail: string;
  userImage?: string | null;
  companyName: string;
  unreadNotifications: number;
  notifications: NotificationBellItem[];
  canManageUsers: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = canManageUsers
    ? [...NAV_ITEMS.slice(0, 3), USERS_NAV_ITEM, ...NAV_ITEMS.slice(3)]
    : [...NAV_ITEMS];

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="glass fixed inset-x-0 top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-white.png" alt="WordPane" className="h-7 w-auto" />
        </div>

        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(href)
                  ? "bg-[rgba(0,209,100,0.08)] text-[#00d164]"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <NotificationBell
            key={unreadNotifications}
            initialUnread={unreadNotifications}
            items={notifications}
            viewAllHref="/portal/notificacoes"
          />
          <UserMenu
            name={userName}
            email={userEmail}
            image={userImage}
            profileHref="/portal/perfil"
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground md:hidden"
                  aria-label="Menu de navegação"
                />
              }
            >
              <Menu className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {companyName}
                  </p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {navItems.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={href}
                  onClick={() => router.push(href)}
                  className={cn(isActive(href) && "text-[#00d164]")}
                >
                  <Icon />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
