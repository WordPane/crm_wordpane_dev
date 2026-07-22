import { z } from "zod";

/** UUID opcional vindo de selects ("" = nenhum). */
const optionalId = z
  .uuid("Selecione uma opção válida.")
  .optional()
  .or(z.literal(""));

/**
 * Metadados do upload (uploadFile) + alvo do vínculo
 * (exatamente um de taskId/projectId/demandId).
 */
export const attachmentFormSchema = z
  .object({
    fileKey: z.string().trim().min(1, "Arquivo inválido.").max(2000),
    fileName: z.string().trim().min(1, "Nome inválido.").max(255),
    fileSize: z.number().int().min(0),
    mimeType: z.string().trim().max(120).optional().or(z.literal("")),
    taskId: optionalId,
    projectId: optionalId,
    demandId: optionalId,
  })
  .refine((data) => data.taskId || data.projectId || data.demandId, {
    message: "Informe o alvo do anexo (tarefa, projeto ou demanda).",
  });

export type AttachmentFormValues = z.infer<typeof attachmentFormSchema>;
