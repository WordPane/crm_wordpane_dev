import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ServiceManager } from "@/components/finance/service-manager";
import { PlanManager } from "@/components/finance/plan-manager";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listCompanies } from "@/lib/queries/companies";
import { listCompanyServices, listServices } from "@/lib/queries/finance";
import {
  listMaintenancePackages,
  listMaintenancePlans,
} from "@/lib/queries/maintenance";
import { listTeamSelectOptions } from "@/lib/queries/team";
import { listProjectTemplateOptions } from "@/lib/queries/templates";

export const metadata: Metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const user = await requireUser();
  requireTeam(user);

  const [services, companyServices, companies, maintenancePlans, maintenancePackages, templates, teamUsers] = await Promise.all([
    listServices(user),
    listCompanyServices(user),
    listCompanies(user),
    listMaintenancePlans(user),
    listMaintenancePackages(user),
    listProjectTemplateOptions(user),
    listTeamSelectOptions(user),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/financeiro"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para o financeiro
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold">Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de serviços, planos de manutenção e assinaturas ativas
            dos clientes.
          </p>
        </div>
      </div>

      <ServiceManager
        services={services}
        companyServices={companyServices}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.nomeFantasia || c.razaoSocial,
        }))}
        templates={templates}
        teamUsers={teamUsers}
        canManage={user.role === "super_admin"}
      />

      <PlanManager
        plans={maintenancePlans}
        packages={maintenancePackages}
        canManage={user.role === "super_admin"}
      />
    </div>
  );
}
