import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmailSettingsForm } from "@/components/settings/email-settings-form";
import { StatusManager } from "@/components/settings/status-manager";
import { requireUser } from "@/lib/access/permissions";
import { getMaskedEmailSettings } from "@/lib/email/settings";
import {
  listProjectStatusesWithUsage,
  listTaskStatusesWithUsage,
} from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/admin/dashboard");

  const [projectStatuses, taskStatuses, emailSettings] = await Promise.all([
    listProjectStatusesWithUsage(user),
    listTaskStatusesWithUsage(user),
    getMaskedEmailSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Envio de e-mails e status configuráveis de projetos e tarefas. Status
          marcados como &ldquo;encerra o item&rdquo; concluem projetos e
          tarefas.
        </p>
      </div>

      <EmailSettingsForm settings={emailSettings} />

      <StatusManager
        projectStatuses={projectStatuses}
        taskStatuses={taskStatuses}
      />
    </div>
  );
}
