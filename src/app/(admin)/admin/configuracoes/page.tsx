import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AsaasSettingsForm } from "@/components/settings/asaas-settings-form";
import { BrandSettingsForm } from "@/components/settings/brand-settings-form";
import { EmailSettingsForm } from "@/components/settings/email-settings-form";
import { IssuerSettingsForm } from "@/components/settings/issuer-settings-form";
import { PlanManager } from "@/components/settings/plan-manager";
import { StatusManager } from "@/components/settings/status-manager";
import { TemplateManager } from "@/components/settings/template-manager";
import { requireUser } from "@/lib/access/permissions";
import { getMaskedAsaasSettings } from "@/lib/asaas/settings";
import { getBranding } from "@/lib/brand/settings";
import { getMaskedEmailSettings } from "@/lib/email/settings";
import { getIssuer } from "@/lib/issuer";
import {
  listMaintenancePackages,
  listMaintenancePlans,
} from "@/lib/queries/maintenance";
import {
  listProjectStatusesWithUsage,
  listTaskStatusesWithUsage,
} from "@/lib/queries/settings";
import { listProjectTemplates } from "@/lib/queries/templates";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/admin/dashboard");

  const [projectStatuses, taskStatuses, emailSettings, asaasSettings, issuer, brand, templates, plans, packages] =
    await Promise.all([
      listProjectStatusesWithUsage(user),
      listTaskStatusesWithUsage(user),
      getMaskedEmailSettings(),
      getMaskedAsaasSettings(),
      getIssuer(),
      getBranding(),
      listProjectTemplates(user),
      listMaintenancePlans(user),
      listMaintenancePackages(user),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Marca, envio de e-mails, cobranças, dados do emissor e status
          configuráveis de projetos e tarefas. Status marcados como
          &ldquo;encerra o item&rdquo; concluem projetos e tarefas.
        </p>
      </div>

      <BrandSettingsForm brand={brand} />

      <IssuerSettingsForm issuer={issuer} />

      <EmailSettingsForm appName={brand.appName} settings={emailSettings} />

      <AsaasSettingsForm
        settings={asaasSettings}
        appUrl={emailSettings?.appUrl}
      />

      <StatusManager
        projectStatuses={projectStatuses}
        taskStatuses={taskStatuses}
      />

      <PlanManager plans={plans} packages={packages} />

      <TemplateManager templates={templates} />
    </div>
  );
}
