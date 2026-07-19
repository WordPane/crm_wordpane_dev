import type { Metadata } from "next";
import { Inbox } from "lucide-react";

import { DemandFilters } from "@/components/demands/demand-filters";
import { DemandList } from "@/components/demands/demand-list";
import { Card, CardContent } from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import type { Demand } from "@/lib/db/schema";
import {
  countOpenDemands,
  listDemands,
  listScopedMilestones,
} from "@/lib/queries/demands";
import { listProjects } from "@/lib/queries/projects";
import { listTeamSelectOptions } from "@/lib/queries/team";
import { demandStatuses } from "@/lib/validations/demand";

export const metadata: Metadata = { title: "Demandas" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function DemandsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const params = await searchParams;
  const statusParam = first(params.status);
  const status = (demandStatuses as readonly string[]).includes(statusParam)
    ? (statusParam as Demand["status"])
    : "";

  const [items, openCount, projects, milestones, teamUsers] =
    await Promise.all([
      listDemands(user, { status: status || undefined }),
      countOpenDemands(user),
      listProjects(user),
      listScopedMilestones(user),
      listTeamSelectOptions(user),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">Demandas</h1>
          {openCount > 0 && (
            <span className="chip">
              {openCount} {openCount === 1 ? "aberta" : "abertas"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {items.length}{" "}
          {items.length === 1 ? "demanda encontrada" : "demandas encontradas"}
        </p>
      </div>

      <DemandFilters status={status} />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Inbox className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhuma demanda encontrada</p>
            <p className="text-sm text-muted-foreground">
              {status
                ? "Ajuste o filtro para ver mais resultados."
                : "As demandas enviadas pelos clientes aparecem aqui."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <DemandList
          demands={items}
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            companyId: p.companyId,
          }))}
          milestones={milestones}
          teamUsers={teamUsers}
          canManage={user.role === "super_admin"}
        />
      )}
    </div>
  );
}
