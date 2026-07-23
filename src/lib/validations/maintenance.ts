import { z } from "zod";

/** Criação/edição de plano de manutenção (catálogo). */
export const maintenancePlanSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "O nome deve ter ao menos 3 caracteres.")
    .max(160, "Máximo de 160 caracteres."),
  description: z.string().trim().max(500, "Máximo de 500 caracteres.").optional(),
  adjustmentsLimit: z.coerce
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .max(999, "Máximo de 999."),
  pagesLimit: z.coerce
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .max(999, "Máximo de 999."),
  /** Valor mensal em texto pt-BR ("490,00"), convertido no servidor. */
  value: z.string().trim().min(1, "Informe o valor mensal."),
});

export type MaintenancePlanValues = z.infer<typeof maintenancePlanSchema>;

/** Criação/edição de pacote extra (catálogo). */
export const maintenancePackageSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "O nome deve ter ao menos 3 caracteres.")
    .max(160, "Máximo de 160 caracteres."),
  adjustments: z.coerce
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .max(999, "Máximo de 999."),
  pages: z.coerce
    .number()
    .int("Informe um número inteiro.")
    .min(0, "Não pode ser negativo.")
    .max(999, "Máximo de 999."),
  /** Valor do pacote em texto pt-BR ("190,00"), convertido no servidor. */
  value: z.string().trim().min(1, "Informe o valor do pacote."),
});

export type MaintenancePackageValues = z.infer<typeof maintenancePackageSchema>;

/** Ativação/troca do plano de manutenção de um projeto. */
export const activateProjectPlanSchema = z.object({
  projectId: z.uuid("Projeto inválido."),
  planId: z.uuid("Selecione o plano."),
});

export type ActivateProjectPlanValues = z.infer<typeof activateProjectPlanSchema>;

/** Compra de pacote extra pelo cliente. */
export const purchasePackageSchema = z.object({
  projectId: z.uuid("Projeto inválido."),
  packageId: z.uuid("Selecione o pacote."),
});

export type PurchasePackageValues = z.infer<typeof purchasePackageSchema>;

/** Tipos de cota consumida por uma demanda. */
export type UsageKind = "adjustment" | "page";
