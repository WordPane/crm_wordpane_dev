import { z } from "zod";

export const commentFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escreva um comentário.")
    .max(5000, "Máximo de 5000 caracteres."),
});

export type CommentFormValues = z.infer<typeof commentFormSchema>;
