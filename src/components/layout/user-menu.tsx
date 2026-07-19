"use client";

import { LogOut, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/server/actions/auth";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function UserMenu({
  name,
  email,
  image,
  profileHref,
}: {
  name: string;
  email: string;
  image?: string | null;
  profileHref?: string;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80">
        <Avatar className="size-8 border border-border">
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
            {initials(name) || <UserRound className="size-4" />}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {profileHref && (
          <DropdownMenuItem onClick={() => router.push(profileHref)}>
            <UserRound />
            Meu perfil
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void logout();
          }}
        >
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
