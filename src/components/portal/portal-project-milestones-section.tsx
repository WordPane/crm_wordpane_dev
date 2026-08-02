"use client";

import { Flag } from "lucide-react";

import { MilestoneStatusChip } from "@/components/chips";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useViewPreference } from "@/lib/use-view-preference";
import type { Milestone } from "@/lib/db/schema";
import { formatDate } from "@/lib/utils/format";

export function PortalProjectMilestonesSection({
  milestones,
  tasksByMilestone,
}: {
  milestones: Milestone[];
  tasksByMilestone: Map<string | null, { status?: { isFinal: boolean } | null }[]>;
}) {
  const [showDone, setShowDone] = useViewPreference<"sim" | "nao">(
    "filter:portal-show-done",
    "nao",
  );

  const visibleMilestones = milestones.filter((m) => {
    if (showDone === "nao" && m.status === "concluida") return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flag className="size-4" />
          Etapas
        </CardTitle>
        <CardDescription>Fases do projeto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={showDone === "sim"}
            onCheckedChange={(checked) =>
              setShowDone(checked ? "sim" : "nao")
            }
          />
          Mostrar concluídas
        </label>

        {visibleMilestones.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma etapa cadastrada ainda.
          </p>
        ) : (
          visibleMilestones.map((milestone) => {
            const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
            const milestoneDone = milestoneTasks.filter(
              (t) => t.status?.isFinal,
            ).length;
            return (
              <section
                key={milestone.id}
                className="rounded-xl p-3 ring-1 ring-foreground/10"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{milestone.name}</h3>
                  <MilestoneStatusChip status={milestone.status} />
                  {milestone.dueDate && (
                    <span className="text-xs text-muted-foreground">
                      até {formatDate(milestone.dueDate)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {milestoneDone} de {milestoneTasks.length} tarefas
                  </span>
                </div>
                {milestone.description && (
                  <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                    {milestone.description}
                  </p>
                )}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
