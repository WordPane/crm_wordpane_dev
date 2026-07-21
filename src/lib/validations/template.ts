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

export const templateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Título é obrigatório.")
    .max(220, "Máximo de 220 caracteres."),
  description: optionalText(5000),
  priority: z.enum(priorities),
  visibleToClient: z.boolean(),
});

export const templateMilestoneSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(160, "Máximo de 160 caracteres."),
  description: optionalText(2000),
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
