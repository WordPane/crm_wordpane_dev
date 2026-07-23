import { z } from "zod";

import type { Demand } from "@/lib/db/schema";
import { priorities } from "@/lib/validations/project";

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
  "nova_pagina",
  "outro",
] as const;

export const demandCategoryLabels: Record<Demand["category"], string> = {
  suporte: "Suporte",
  alteracao: "Alteração",
  nova_funcionalidade: "Nova funcionalidade",
  correcao: "Correção",
  nova_pagina: "Nova página",
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

/** Edição da demanda pela equipe (super admin) — inclusive o projeto vinculado. */
export const demandUpdateSchema = z.object({
  projectId: z.uuid("Selecione o projeto.").optional().or(z.literal("")),
  title: z
    .string()
    .trim()
    .min(5, "O título deve ter ao menos 5 caracteres.")
    .max(220, "Máximo de 220 caracteres."),
  category: z.enum(demandCategories, "Selecione a categoria."),
  priority: z.enum(priorities, "Selecione a prioridade."),
  description: z
    .string()
    .trim()
    .min(20, "Descreva a demanda com ao menos 20 caracteres.")
    .max(5000, "Máximo de 5000 caracteres."),
});

export type DemandUpdateValues = z.infer<typeof demandUpdateSchema>;

/** Conversão da demanda em tarefa da equipe. */
export const convertDemandSchema = z.object({
  projectId: z.uuid("Selecione o projeto."),
  milestoneId: optionalId,
  ownerId: optionalId,
});

export type ConvertDemandValues = z.infer<typeof convertDemandSchema>;
