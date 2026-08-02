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

/** Item da tabela: empresa opcional (o portal não exibe a coluna). */
type ProjectsTableItem = Omit<ProjectListItem, "companyId" | "companyName"> & {
  companyId?: string;
  companyName?: string;
};

/** Tabela de projetos — usada na lista global, na aba da empresa e no portal do cliente. */
export function ProjectsTable({
  items,
  showCompany = true,
  hrefBase = "/admin/projetos",
}: {
  items: ProjectsTableItem[];
  showCompany?: boolean;
  hrefBase?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[44rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="whitespace-nowrap pl-4">Projeto</TableHead>
            {showCompany && <TableHead className="whitespace-nowrap">Empresa</TableHead>}
            <TableHead className="whitespace-nowrap">Tipo</TableHead>
            <TableHead className="whitespace-nowrap">Status</TableHead>
            <TableHead className="whitespace-nowrap">Prioridade</TableHead>
            <TableHead className="whitespace-nowrap">Responsável</TableHead>
            <TableHead className="whitespace-nowrap">Prazo</TableHead>
            <TableHead className="whitespace-nowrap pr-4">Progresso</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => {
            const overdue = !p.completedAt && isOverdue(p.dueDate);
            return (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap pl-4">
                  <Link
                    href={`${hrefBase}/${p.id}`}
                    className="font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {p.name}
                  </Link>
                </TableCell>
                {showCompany && (
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/admin/clientes/${p.companyId}`}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {p.companyName}
                    </Link>
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {projectTypeLabels[p.type]}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.status ? (
                    <StatusColorChip name={p.status.name} color={p.status.color} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <PriorityChip priority={p.priority} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {p.ownerName ?? "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "whitespace-nowrap",
                    overdue ? "font-medium text-red-300" : "text-muted-foreground",
                  )}
                >
                  {formatDate(p.dueDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap pr-4">
                  <ProjectProgress done={p.doneTasks} total={p.totalTasks} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
