import { z } from "zod";

export const userStatuses = ["active", "invited", "suspended"] as const;
export const teamRoles = ["admin", "super_admin"] as const;

/** Campo de texto opcional: aceita vazio (""), limita o tamanho. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

// bcrypt considera no máximo 72 bytes de senha
const passwordCreate = z
  .string()
  .min(6, "A senha deve ter ao menos 6 caracteres.")
  .max(72, "Máximo de 72 caracteres.");

const passwordUpdate = z
  .string()
  .min(6, "A senha deve ter ao menos 6 caracteres.")
  .max(72, "Máximo de 72 caracteres.")
  .optional()
  .or(z.literal(""));

const baseUserFields = {
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(160, "Máximo de 160 caracteres."),
  email: z.email("Informe um e-mail válido.").max(255, "Máximo de 255 caracteres."),
  position: optionalText(120),
  status: z.enum(userStatuses),
};

// ─────────────────────────── Usuários de empresas (portal) ───────────────────────────

export const companyUserCreateSchema = z.object({
  ...baseUserFields,
  phone: optionalText(20),
  password: passwordCreate,
  isCompanyAdmin: z.boolean(),
});

export const companyUserUpdateSchema = companyUserCreateSchema.extend({
  password: passwordUpdate,
});

export type CompanyUserCreateValues = z.infer<typeof companyUserCreateSchema>;
export type CompanyUserUpdateValues = z.infer<typeof companyUserUpdateSchema>;

// ─────────────────────────── Equipe interna ───────────────────────────

export const teamMemberCreateSchema = z.object({
  ...baseUserFields,
  role: z.enum(teamRoles),
  password: passwordCreate,
});

export const teamMemberUpdateSchema = teamMemberCreateSchema.extend({
  password: passwordUpdate,
});

export type TeamMemberCreateValues = z.infer<typeof teamMemberCreateSchema>;
export type TeamMemberUpdateValues = z.infer<typeof teamMemberUpdateSchema>;

export const adminAssignmentsSchema = z.object({
  adminId: z.uuid("ID inválido."),
  companyIds: z.array(z.uuid("ID inválido.")).max(1000),
});
