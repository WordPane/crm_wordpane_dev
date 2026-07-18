"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

export function CompanySearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const current =
      new URLSearchParams(window.location.search).get("q") ?? "";
    const next = value.trim();
    if (next === current) return;

    const timeout = setTimeout(() => {
      router.replace(next ? `${pathname}?q=${encodeURIComponent(next)}` : pathname, {
        scroll: false,
      });
    }, 350);
    return () => clearTimeout(timeout);
  }, [value, pathname, router]);

  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por nome ou CNPJ..."
        className="bg-white/[0.03] pl-9"
        aria-label="Buscar clientes"
      />
    </div>
  );
}
