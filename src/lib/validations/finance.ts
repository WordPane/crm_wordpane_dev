import { z } from "zod";

import type { Charge, Service } from "@/lib/db/schema";

// ─────────────────────────── Labels pt-BR ───────────────────────────

export const serviceBillings = ["one_time", "recurring"] as const;
export const serviceBillingLabels: Record<Service["billing"], string> = {
  one_time: "Avulso",
  recurring: "Recorrente",
};

export const subscriptionCycles = [
  "weekly",
  "monthly",
  "quarterly",
  "semiannually",
  "yearly",
] as const;
export const subscriptionCycleLabels: Record<Service["cycle"], string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannually: "Semestral",
  yearly: "Anual",
};

export const chargeBillingTypes = [
  "pix",
  "boleto",
  "credit_card",
  "undefined",
] as const;
export const chargeBillingTypeLabels: Record<Charge["billingType"], string> = {
  pix: "PIX",
  boleto: "Boleto",
  credit_card: "Cartão de crédito",
  undefined: "Cliente escolhe",
};

export const chargeStatuses = [
  "pending",
  "confirmed",
  "received",
  "overdue",
  "refunded",
  "cancelled",
] as const;
export const chargeStatusLabels: Record<Charge["status"], string> = {
  pending: "Aguardando pagamento",
  confirmed: "Pago (em liquidação)",
  received: "Pago",
  overdue: "Vencida",
  refunded: "Estornada",
  cancelled: "Cancelada",
};

/** Status considerados "pagos" para agrupar na UI. */
export const PAID_CHARGE_STATUSES: Charge["status"][] = [
  "confirmed",
  "received",
];

// ─────────────────────────── Schemas ───────────────────────────

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .min(1, "Informe a data.");

/** Formulário do catálogo de serviços (valor em texto pt-BR). */
export const serviceFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do serviço.")
    .max(160, "Máximo de 160 caracteres."),
  description: z.string().trim().max(500, "Máximo de 500 caracteres."),
  defaultValue: z.string().trim().min(1, "Informe o valor padrão."),
  billing: z.enum(serviceBillings),
  cycle: z.enum(subscriptionCycles),
  /** Código municipal de serviço para NFS-e (vazio = padrão do emissor). */
  serviceCode: z
    .string()
    .trim()
    .max(20, "Máximo de 20 caracteres.")
    .optional()
    .or(z.literal("")),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

/** Formulário de cobrança avulsa (valor em texto pt-BR). */
export const chargeFormSchema = z.object({
  companyId: z.uuid("Selecione a empresa."),
  description: z
    .string()
    .trim()
    .min(1, "Descreva a cobrança.")
    .max(500, "Máximo de 500 caracteres."),
  value: z.string().trim().min(1, "Informe o valor."),
  billingType: z.enum(chargeBillingTypes),
  dueDate: dateString,
});

export type ChargeFormValues = z.infer<typeof chargeFormSchema>;

/** Ativação de serviço para uma empresa. */
export const activateServiceSchema = z.object({
  companyId: z.uuid("Selecione a empresa."),
  serviceId: z.uuid("Selecione o serviço."),
  value: z.string(), // vazio = usa o valor padrão do serviço
  billingType: z.enum(chargeBillingTypes),
  firstDueDate: dateString,
});

export type ActivateServiceValues = z.infer<typeof activateServiceSchema>;

/** Geração de cobrança a partir de orçamento aprovado. */
export const chargeFromQuoteSchema = z.object({
  billingType: z.enum(chargeBillingTypes),
  dueDate: dateString,
});

export type ChargeFromQuoteValues = z.infer<typeof chargeFromQuoteSchema>;

/** Edição de uma cobrança em aberto (descrição, valor, meio de pagamento, vencimento). */
export const updateChargeSchema = z.object({
  chargeId: z.uuid("Cobrança inválida."),
  description: z
    .string()
    .trim()
    .min(1, "Descreva a cobrança.")
    .max(500, "Máximo de 500 caracteres."),
  value: z.string().trim().min(1, "Informe o valor."),
  billingType: z.enum(chargeBillingTypes),
  dueDate: dateString,
});

export type UpdateChargeValues = z.infer<typeof updateChargeSchema>;
