import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StatusManager } from "@/components/settings/status-manager";
import { requireUser } from "@/lib/access/permissions";
import {
  listProjectStatusesWithUsage,
  listTaskStatusesWithUsage,
} from "@/lib/queries/settings";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/admin/dashboard");

  const [projectStatuses, taskStatuses] = await Promise.all([
    listProjectStatusesWithUsage(user),
    listTaskStatusesWithUsage(user),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Status configuráveis de projetos e tarefas. Status marcados como
          &ldquo;encerra o item&rdquo; concluem projetos e tarefas.
        </p>
      </div>

      <StatusManager
        projectStatuses={projectStatuses}
        taskStatuses={taskStatuses}
      />
    </div>
  );
}
