import type { Metadata } from "next";
import { ArrowRight, Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DemandCategoryChip,
  DemandStatusChip,
  PriorityChip,
} from "@/components/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { listPortalDemands } from "@/lib/queries/portal";
import { formatDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Demandas" };

export default async function PortalDemandsPage() {
  const user = await requireUser();

  let demands;
  try {
    demands = await listPortalDemands(user);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Demandas</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos que você enviou para a equipe WordPane.
          </p>
        </div>
        <Button render={<Link href="/portal/demandas/nova" />}>
          <Plus />
          Nova demanda
        </Button>
      </div>

      {demands.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Inbox className="size-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhuma demanda enviada ainda</p>
            <p className="text-sm text-muted-foreground">
              Precisa de um ajuste, correção ou novidade? Envie sua primeira
              demanda.
            </p>
            <Button render={<Link href="/portal/demandas/nova" />} className="mt-2">
              <Plus />
              Nova demanda
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {demands.map((demand) => (
            <li
              key={demand.id}
              className="rounded-xl bg-card p-4 ring-1 ring-foreground/10"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {demand.title}
                </span>
                <DemandCategoryChip category={demand.category} />
                <PriorityChip priority={demand.priority} />
                <DemandStatusChip status={demand.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {demand.project && (
                  <Link
                    href={`/portal/projetos/${demand.project.id}`}
                    className="inline-flex items-center gap-1 font-medium text-[#00d164] transition-colors hover:text-foreground"
                  >
                    {demand.project.name}
                  </Link>
                )}
                <span>Enviada em {formatDate(demand.createdAt)}</span>
                {demand.task?.visible && (
                  <Link
                    href={`/portal/projetos/${demand.task.projectId}/tarefas/${demand.task.id}`}
                    className="inline-flex items-center gap-1 font-medium text-[#00d164] transition-colors hover:text-foreground"
                  >
                    Ver tarefa vinculada
                    <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
