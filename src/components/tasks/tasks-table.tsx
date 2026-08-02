"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PriorityChip, StatusColorChip } from "@/components/chips";
import { TaskBulkActions } from "@/components/tasks/task-bulk-actions";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StatusInfo } from "@/lib/queries/projects";
import type { TaskListItem } from "@/lib/queries/tasks";
import { formatDate, isOverdue } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export function TasksTable({
  items,
  statuses,
  teamUsers,
}: {
  items: TaskListItem[];
  statuses: StatusInfo[];
  teamUsers: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && selected.size < items.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((t) => t.id)));
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const teamUserOptions = useMemo(
    () => teamUsers.map((u) => ({ id: u.id, name: u.name })),
    [teamUsers],
  );

  return (
    <div className="space-y-3">
      <TaskBulkActions
        selectedIds={[...selected]}
        statuses={statuses}
        teamUsers={teamUserOptions}
        onClear={() => setSelected(new Set())}
      />

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="overflow-x-auto">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 whitespace-nowrap pl-4">
                  <Checkbox
                    checked={allSelected}
                    data-state={someSelected ? "indeterminate" : undefined}
                    aria-label="Selecionar todas"
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="whitespace-nowrap">Tarefa</TableHead>
                <TableHead className="whitespace-nowrap">Projeto</TableHead>
                <TableHead className="whitespace-nowrap">Empresa</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Prioridade</TableHead>
                <TableHead className="whitespace-nowrap">Responsável</TableHead>
                <TableHead className="whitespace-nowrap pr-4">Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => {
                const overdue = !t.completedAt && isOverdue(t.dueDate);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={selected.has(t.id)}
                        aria-label={`Selecionar ${t.title}`}
                        onCheckedChange={() => toggle(t.id)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/admin/tarefas/${t.id}`}
                        className="font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {t.title}
                      </Link>
                      {t.blockedByCount > 0 && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 text-xs text-amber-300"
                          title={`${t.blockedByCount} dependência(s) pendente(s)`}
                        >
                          <ShieldAlert className="size-3.5" />
                          Bloqueada
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/admin/projetos/${t.projectId}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t.projectName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/admin/clientes/${t.companyId}`}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {t.companyName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {t.status ? (
                        <StatusColorChip
                          name={t.status.name}
                          color={t.status.color}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <PriorityChip priority={t.priority} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {t.ownerName ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap pr-4",
                        overdue
                          ? "font-medium text-red-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatDate(t.dueDate)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
