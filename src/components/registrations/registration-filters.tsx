"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  registrationStatusLabels,
  registrationStatuses,
} from "@/lib/validations/registration";

const ALL = "todos";

/** Filtro da triagem de cadastros — searchParams (status; sem param = pendente). */
export function RegistrationFilters({ status }: { status: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function updateStatus(value: string | null) {
    const params = new URLSearchParams(window.location.search);
    // "pendente" é o padrão da página: volta a ser a URL limpa
    if (!value || value === "pendente") params.delete("status");
    else params.set("status", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={status || ALL} onValueChange={updateStatus}>
        <SelectTrigger aria-label="Filtrar por status">
          <SelectValue placeholder="Status">
            {(value: string | null) => {
              if (!value || value === ALL) return "Todos os status";
              const s = registrationStatuses.find((s) => s === value);
              return s ? registrationStatusLabels[s] : "Status";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {registrationStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {registrationStatusLabels[s]}
            </SelectItem>
          ))}
          <SelectItem value={ALL}>Todos os status</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
