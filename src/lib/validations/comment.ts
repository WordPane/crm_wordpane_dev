import { z } from "zod";

export const commentFormSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escreva um comentário.")
    .max(5000, "Máximo de 5000 caracteres."),
  /** Comentário respondido (thread de 1 nível). */
  parentId: z.uuid().optional().or(z.literal("")),
  /** Ids de usuários mencionados com @ (máx. 10). */
  mentions: z.array(z.uuid()).max(10).optional(),
});

export type CommentFormValues = z.infer<typeof commentFormSchema>;
