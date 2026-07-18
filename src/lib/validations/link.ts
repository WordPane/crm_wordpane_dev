import { z } from "zod";

/** Campo de texto opcional: aceita vazio (""), limita o tamanho. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

export const projectLinkFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "URL é obrigatória.")
    .max(2000, "URL muito longa.")
    .refine(
      (value) => /^https?:\/\/.+/i.test(value),
      "Informe uma URL válida começando com http:// ou https://.",
    ),
  description: optionalText(255),
  version: optionalText(40),
  notes: optionalText(2000),
});

export type ProjectLinkFormValues = z.infer<typeof projectLinkFormSchema>;
