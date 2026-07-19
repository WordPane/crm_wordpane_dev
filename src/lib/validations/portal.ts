import { z } from "zod";

import { demandCategories } from "@/lib/validations/demand";
import { priorities } from "@/lib/validations/project";
import { userStatuses } from "@/lib/validations/user";

/** Campo de texto opcional: aceita vazio (""), limita o tamanho. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

// ─────────────────────────── Demanda (portal do cliente) ───────────────────────────

/** Metadados de um arquivo já enviado via POST /api/upload. */
const demandAttachmentSchema = z.object({
  fileKey: z.string().trim().min(1, "Arquivo inválido.").max(2000),
  fileName: z.string().trim().min(1, "Nome inválido.").max(255),
  fileSize: z.number().int().min(0),
  mimeType: z.string().trim().max(120).optional().or(z.literal("")),
});

export const portalDemandSchema = z.object({
  projectId: z.uuid("Selecione o projeto."),
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
  attachments: z
    .array(demandAttachmentSchema)
    .max(10, "Máximo de 10 arquivos por demanda.")
    .optional(),
});

export type PortalDemandValues = z.infer<typeof portalDemandSchema>;
export type PortalDemandAttachment = z.infer<typeof demandAttachmentSchema>;

// ─────────────────────────── Comentário ───────────────────────────

export const portalCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Escreva um comentário.")
    .max(5000, "Máximo de 5000 caracteres."),
});

export type PortalCommentValues = z.infer<typeof portalCommentSchema>;

// ─────────────────────────── Perfil ───────────────────────────

export const portalProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(160, "Máximo de 160 caracteres."),
  phone: optionalText(20),
  position: optionalText(120),
});

export type PortalProfileValues = z.infer<typeof portalProfileSchema>;

// ─────────────────────────── Avatar ───────────────────────────

/** Metadados do upload da foto (POST /api/upload) — precisa ser imagem. */
export const portalAvatarSchema = z
  .object({
    fileKey: z.string().trim().min(1, "Arquivo inválido.").max(2000),
    publicUrl: z.url("URL inválida.").optional().or(z.literal("")),
    mimeType: z.string().trim().min(1, "Tipo inválido.").max(120),
  })
  .refine((data) => data.mimeType.startsWith("image/"), {
    message: "A foto precisa ser uma imagem.",
    path: ["mimeType"],
  });

export type PortalAvatarValues = z.infer<typeof portalAvatarSchema>;

// ─────────────────────────── Troca de senha ───────────────────────────

export const portalPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    // bcrypt considera no máximo 72 bytes de senha
    newPassword: z
      .string()
      .min(6, "A nova senha deve ter ao menos 6 caracteres.")
      .max(72, "Máximo de 72 caracteres."),
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "A confirmação não confere com a nova senha.",
    path: ["confirmPassword"],
  });

export type PortalPasswordValues = z.infer<typeof portalPasswordSchema>;

// ─────────────────────────── Usuários da empresa (admin da empresa) ───────────────────────────

// bcrypt considera no máximo 72 bytes de senha
const userPasswordCreate = z
  .string()
  .min(6, "A senha deve ter ao menos 6 caracteres.")
  .max(72, "Máximo de 72 caracteres.");

const userPasswordUpdate = z
  .string()
  .min(6, "A senha deve ter ao menos 6 caracteres.")
  .max(72, "Máximo de 72 caracteres.")
  .optional()
  .or(z.literal(""));

const portalUserBaseFields = {
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(160, "Máximo de 160 caracteres."),
  email: z.email("Informe um e-mail válido.").max(255, "Máximo de 255 caracteres."),
  phone: optionalText(20),
  position: optionalText(120),
  status: z.enum(userStatuses),
  isCompanyAdmin: z.boolean(),
};

export const portalUserCreateSchema = z.object({
  ...portalUserBaseFields,
  password: userPasswordCreate,
});

export const portalUserUpdateSchema = z.object({
  ...portalUserBaseFields,
  password: userPasswordUpdate,
});

export type PortalUserCreateValues = z.infer<typeof portalUserCreateSchema>;
export type PortalUserUpdateValues = z.infer<typeof portalUserUpdateSchema>;
