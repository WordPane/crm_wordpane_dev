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

/** Ativação de plano da empresa com cobertura de 1..N projetos. */
export const companyPlanSchema = z.object({
  companyId: z.uuid("Empresa inválida."),
  planId: z.uuid("Selecione o plano."),
  projectIds: z
    .array(z.uuid("Projeto inválido."))
    .min(1, "Selecione ao menos 1 projeto."),
});

export type CompanyPlanValues = z.infer<typeof companyPlanSchema>;

/** Contratação do plano pelo cliente (portal): cobertura + modalidade. */
export const subscribePlanSchema = z.object({
  planId: z.uuid("Selecione o plano."),
  projectIds: z
    .array(z.uuid("Projeto inválido."))
    .min(1, "Selecione ao menos 1 projeto."),
  billingMode: z.enum(["one_time", "recurring"], "Selecione a modalidade."),
});

export type SubscribePlanValues = z.infer<typeof subscribePlanSchema>;

/** Troca o plano de uma instância (mantém ciclo e consumo). */
export const changePlanSchema = z.object({
  projectPlanId: z.uuid("Plano inválido."),
  planId: z.uuid("Selecione o plano."),
});

export type ChangePlanValues = z.infer<typeof changePlanSchema>;

/** Ajuste da cobertura (projetos) de um plano ativo da empresa. */
export const planCoverageSchema = z.object({
  projectPlanId: z.uuid("Plano inválido."),
  projectIds: z
    .array(z.uuid("Projeto inválido."))
    .min(1, "Selecione ao menos 1 projeto."),
});

export type PlanCoverageValues = z.infer<typeof planCoverageSchema>;

/** Pacote manual em uma instância de plano da empresa. */
export const planPackageSchema = z.object({
  projectPlanId: z.uuid("Plano inválido."),
  packageId: z.uuid("Selecione o pacote."),
});

export type PlanPackageValues = z.infer<typeof planPackageSchema>;

/** Compra de pacote extra pelo cliente. */
export const purchasePackageSchema = z.object({
  projectId: z.uuid("Projeto inválido."),
  packageId: z.uuid("Selecione o pacote."),
});

export type PurchasePackageValues = z.infer<typeof purchasePackageSchema>;

/** Tipos de cota consumida por uma demanda. */
export type UsageKind = "adjustment" | "page";
