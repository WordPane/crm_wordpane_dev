import { z } from "zod";

export const statusFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(80, "Máximo de 80 caracteres."),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB)."),
  isFinal: z.boolean(),
  active: z.boolean(),
});

export type StatusFormValues = z.infer<typeof statusFormSchema>;
