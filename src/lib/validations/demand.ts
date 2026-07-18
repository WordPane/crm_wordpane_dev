import { z } from "zod";

import type { Demand } from "@/lib/db/schema";

export const demandStatuses = [
  "aberta",
  "em_analise",
  "em_andamento",
  "concluida",
  "recusada",
] as const;

export const demandStatusLabels: Record<Demand["status"], string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  recusada: "Recusada",
};

export const demandCategories = [
  "suporte",
  "alteracao",
  "nova_funcionalidade",
  "correcao",
  "outro",
] as const;

export const demandCategoryLabels: Record<Demand["category"], string> = {
  suporte: "Suporte",
  alteracao: "Alteração",
  nova_funcionalidade: "Nova funcionalidade",
  correcao: "Correção",
  outro: "Outro",
};

/** UUID opcional vindo de selects ("" = nenhum). */
const optionalId = z
  .uuid("Selecione uma opção válida.")
  .optional()
  .or(z.literal(""));

export const demandStatusUpdateSchema = z.object({
  status: z.enum(demandStatuses),
});

/** Conversão da demanda em tarefa da equipe. */
export const convertDemandSchema = z.object({
  projectId: z.uuid("Selecione o projeto."),
  milestoneId: optionalId,
  ownerId: optionalId,
});

export type ConvertDemandValues = z.infer<typeof convertDemandSchema>;
