import Link from "next/link";

import { PriorityChip, StatusColorChip } from "@/components/chips";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectListItem } from "@/lib/queries/projects";
import { formatDate, isOverdue } from "@/lib/utils/format";
import { projectTypeLabels } from "@/lib/validations/project";
import { cn } from "@/lib/utils";

function ProjectProgress({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex min-w-28 items-center gap-2">
      <Progress value={percent} className="flex-1" />
      <span className="text-xs text-muted-foreground tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

/** Tabela de projetos — usada na lista global e na aba da empresa (compacta). */
export function ProjectsTable({
  items,
  showCompany = true,
}: {
  items: ProjectListItem[];
  showCompany?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Projeto</TableHead>
          {showCompany && <TableHead>Empresa</TableHead>}
          <TableHead>Tipo</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Prioridade</TableHead>
          <TableHead>Responsável</TableHead>
          <TableHead>Prazo</TableHead>
          <TableHead>Progresso</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((p) => {
          const overdue = !p.completedAt && isOverdue(p.dueDate);
          return (
            <TableRow key={p.id}>
              <TableCell>
                <Link
                  href={`/admin/projetos/${p.id}`}
                  className="font-medium text-foreground transition-colors hover:text-primary"
                >
                  {p.name}
                </Link>
              </TableCell>
              {showCompany && (
                <TableCell>
                  <Link
                    href={`/admin/clientes/${p.companyId}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {p.companyName}
                  </Link>
                </TableCell>
              )}
              <TableCell className="text-muted-foreground">
                {projectTypeLabels[p.type]}
              </TableCell>
              <TableCell>
                {p.status ? (
                  <StatusColorChip name={p.status.name} color={p.status.color} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <PriorityChip priority={p.priority} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {p.ownerName ?? "—"}
              </TableCell>
              <TableCell
                className={cn(
                  overdue ? "font-medium text-red-300" : "text-muted-foreground",
                )}
              >
                {formatDate(p.dueDate)}
              </TableCell>
              <TableCell>
                <ProjectProgress done={p.doneTasks} total={p.totalTasks} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
