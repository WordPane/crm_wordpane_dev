import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";

import { RegistrationFilters } from "@/components/registrations/registration-filters";
import { RegistrationList } from "@/components/registrations/registration-list";
import { Card, CardContent } from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import type { ClientRegistration } from "@/lib/db/schema";
import {
  countPendingRegistrations,
  listRegistrations,
} from "@/lib/queries/registrations";
import { registrationStatuses } from "@/lib/validations/registration";

export const metadata: Metadata = { title: "Cadastros" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const user = await requireUser();
  requireTeam(user);
  // Triagem de cadastros é exclusiva de super admins.
  if (user.role !== "super_admin") redirect("/admin/dashboard");

  const params = await searchParams;
  const statusParam = first(params.status);
  // Padrão da triagem: pendentes. "todos" lista tudo.
  const status = (registrationStatuses as readonly string[]).includes(
    statusParam,
  )
    ? (statusParam as ClientRegistration["status"])
    : statusParam === "todos"
      ? undefined
      : "pendente";

  const [items, pendingCount] = await Promise.all([
    listRegistrations(user, status),
    countPendingRegistrations(user),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">Cadastros</h1>
          {pendingCount > 0 && (
            <span className="chip">
              {pendingCount} {pendingCount === 1 ? "pendente" : "pendentes"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {items.length}{" "}
          {items.length === 1
            ? "cadastro encontrado"
            : "cadastros encontrados"}
        </p>
      </div>

      <RegistrationFilters status={status ?? "todos"} />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhum cadastro encontrado</p>
            <p className="text-sm text-muted-foreground">
              {status === "pendente"
                ? "Não há cadastros aguardando triagem no momento."
                : "Ajuste o filtro para ver mais resultados."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <RegistrationList registrations={items} />
      )}
    </div>
  );
}
