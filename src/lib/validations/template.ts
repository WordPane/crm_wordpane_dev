import { z } from "zod";

import { priorities } from "@/lib/validations/project";

/** Campo de texto opcional: aceita vazio (""), limita o tamanho. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

/**
 * Prazo relativo opcional, em dias corridos após o início do projeto.
 * Vem de input numérico do formulário (coerce, como em maintenance.ts);
 * "" ou null = sem prazo.
 */
const optionalDueInDays = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .max(3650, "Máximo de 3650 dias.")
    .optional(),
);

export const templateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Título é obrigatório.")
    .max(220, "Máximo de 220 caracteres."),
  description: optionalText(5000),
  priority: z.enum(priorities),
  visibleToClient: z.boolean(),
  dueInDays: optionalDueInDays,
});

export const templateMilestoneSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(160, "Máximo de 160 caracteres."),
  description: optionalText(2000),
  dueInDays: optionalDueInDays,
  tasks: z.array(templateTaskSchema).max(100, "Máximo de 100 tarefas por etapa."),
});

/** Modelo de projeto: nome + árvore de etapas e tarefas (salvo de uma vez). */
export const projectTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(160, "Máximo de 160 caracteres."),
  description: optionalText(2000),
  milestones: z
    .array(templateMilestoneSchema)
    .min(1, "Adicione ao menos uma etapa.")
    .max(50, "Máximo de 50 etapas."),
});

export type ProjectTemplateValues = z.infer<typeof projectTemplateSchema>;
export type TemplateMilestoneValues = z.infer<typeof templateMilestoneSchema>;
export type TemplateTaskValues = z.infer<typeof templateTaskSchema>;
