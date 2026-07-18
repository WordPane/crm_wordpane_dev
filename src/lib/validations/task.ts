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

/** UUID opcional vindo de selects ("" = nenhum). */
const optionalId = z.uuid("Selecione uma opção válida.").optional().or(z.literal(""));

/** Data opcional no formato do input type=date (yyyy-mm-dd). */
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .or(z.literal(""));

export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Título é obrigatório.")
    .max(220, "Máximo de 220 caracteres."),
  description: optionalText(5000),
  milestoneId: optionalId,
  ownerId: optionalId,
  priority: z.enum(priorities),
  dueDate: optionalDate,
  statusId: optionalId,
  visibleToClient: z.boolean(),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

/** Edição parcial (sidebar: responsável, visibilidade etc.). */
export const taskUpdateSchema = taskFormSchema.partial();

export type TaskUpdateValues = z.infer<typeof taskUpdateSchema>;

export const checklistItemSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Descreva o item.")
    .max(300, "Máximo de 300 caracteres."),
});
