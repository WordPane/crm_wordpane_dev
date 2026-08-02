"use server";

import { requireUser } from "@/lib/access/permissions";
import { toCsv } from "@/lib/reports/export-csv";
import { formatCurrency } from "@/lib/utils/format";
import { listProjects } from "@/lib/queries/projects";
import { listTasks } from "@/lib/queries/tasks";
import { listCharges } from "@/lib/queries/finance";
import { actionError, type ActionResult } from "@/server/actions/utils";

type CsvResult = ActionResult & { csv?: string };

export async function exportProjectsCsv(): Promise<CsvResult> {
  try {
    const user = await requireUser();
    const items = await listProjects(user);
    const csv = toCsv(
      items.map((p) => ({
        Nome: p.name,
        Tipo: p.type,
        Empresa: p.companyName,
        Status: p.status?.name ?? "—",
        Prioridade: p.priority,
        Responsavel: p.ownerName ?? "—",
        Inicio: p.startDate,
        Prazo: p.dueDate,
        ConcluidoEm: p.completedAt ?? "—",
        Tarefas: p.totalTasks,
        Concluidas: p.doneTasks,
      })),
    );
    return { success: true, csv };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportTasksCsv(): Promise<CsvResult> {
  try {
    const user = await requireUser();
    const items = await listTasks(user);
    const csv = toCsv(
      items.map((t) => ({
        Tarefa: t.title,
        Projeto: t.projectName,
        Empresa: t.companyName,
        Status: t.status?.name ?? "—",
        Prioridade: t.priority,
        Responsavel: t.ownerName ?? "—",
        Prazo: t.dueDate,
        ConcluidaEm: t.completedAt ?? "—",
      })),
    );
    return { success: true, csv };
  } catch (error) {
    return actionError(error);
  }
}

export async function exportChargesCsv(): Promise<CsvResult> {
  try {
    const user = await requireUser();
    const items = await listCharges(user);
    const csv = toCsv(
      items.map((c) => ({
        Descricao: c.description,
        Empresa: c.company.name,
        Valor: formatCurrency(c.valueCents),
        Forma: c.billingType,
        Vencimento: c.dueDate,
        Status: c.status,
        Pagamento: c.paidAt ?? "—",
      })),
    );
    return { success: true, csv };
  } catch (error) {
    return actionError(error);
  }
}
