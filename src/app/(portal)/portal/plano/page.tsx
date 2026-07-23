import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PortalPlansClient } from "@/components/portal/portal-plans-client";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import {
  getPortalCompanyPlanInstances,
  listCatalogMaintenancePlans,
} from "@/lib/queries/maintenance";
import { listPortalProjects } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "Manutenção" };

export default async function PortalPlanPage() {
  const user = await requireUser();

  let instances;
  try {
    instances = await getPortalCompanyPlanInstances(user);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const [catalogPlans, projects] = await Promise.all([
    listCatalogMaintenancePlans(),
    listPortalProjects(user),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Manutenção</h1>
        <p className="text-sm text-muted-foreground">
          Seu plano de manutenção: cota mensal de ajustes e páginas novas para
          os seus sites, pacotes extras e contratação.
        </p>
      </div>

      <PortalPlansClient
        instances={instances}
        catalogPlans={catalogPlans}
        companyProjects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
