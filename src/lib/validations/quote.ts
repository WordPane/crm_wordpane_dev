import { z } from "zod";

import type { Quote } from "@/lib/db/schema";
import { businessToday } from "@/lib/utils/format";
import { demandAttachmentSchema } from "@/lib/validations/portal";

export const quoteStatuses = [
  "requested",
  "draft",
  "sent",
  "approved",
  "rejected",
] as const;

export const quoteStatusLabels: Record<Quote["status"], string> = {
  draft: "Rascunho",
  sent: "Aguardando resposta",
  approved: "Aprovado",
  rejected: "Recusado",
  requested: "Solicitado",
};

export const quoteDiscountTypes = ["amount", "percent"] as const;

export const quoteDiscountTypeLabels: Record<Quote["discountType"], string> = {
  amount: "R$",
  percent: "%",
};

/** "1.234,56" → 123456 centavos. Null quando o formato é inválido. */
export function parseCurrencyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  if (!cleaned) return 0; // campo vazio = zero
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** "10,5" → 1050 pontos-base (10,50%). Null quando o formato é inválido. */
export function parsePercentToBps(value: string): number | null {
  return parseCurrencyToCents(value); // mesmo formato: dígitos + até 2 casas
}

/** "1,5" → 1.5. Null quando inválida ou ≤ 0. */
export function parseQuantity(value: string): number | null {
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}

/** Total de um item em centavos (quantidade pode ser fracionada). */
export function quoteItemTotalCents(
  quantity: number,
  unitPriceCents: number,
): number {
  return Math.round(quantity * unitPriceCents);
}

/** Total do orçamento: soma dos itens − desconto. */
export function quoteTotalCents(
  items: { quantity: number; unitPriceCents: number }[],
  discountCents: number,
): number {
  const subtotal = items.reduce(
    (sum, item) => sum + quoteItemTotalCents(item.quantity, item.unitPriceCents),
    0,
  );
  return subtotal - discountCents;
}

// ─────────────────────────── Formulário (campos em texto) ───────────────────────────

export const quoteFormSchema = z.object({
  companyId: z.uuid("Selecione a empresa."),
  title: z
    .string()
    .trim()
    .min(1, "Informe o título do orçamento.")
    .max(220, "Título muito longo."),
  validUntil: z.string(), // "YYYY-MM-DD" ou ""
  discount: z.string(), // "1.234,56" (R$) ou "10,5" (%) — "" = sem desconto
  discountType: z.enum(quoteDiscountTypes),
  notes: z.string(),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Descreva o item."),
        quantity: z.string().trim().min(1, "Informe a quantidade."),
        unitPrice: z.string().trim().min(1, "Informe o valor unitário."),
        /** Serviço do catálogo que originou o item ("" = manual). */
        serviceId: z.string(),
      }),
    )
    .min(1, "Adicione ao menos um item."),
});

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;

export const emptyQuoteValues: QuoteFormValues = {
  companyId: "",
  title: "",
  validUntil: "",
  discount: "",
  discountType: "amount",
  notes: "",
  items: [{ description: "", quantity: "1", unitPrice: "", serviceId: "" }],
};

// ─────────────────────────── Payload da action (valores já em centavos) ───────────────────────────

export const quotePayloadSchema = z.object({
  companyId: z.uuid("Selecione a empresa."),
  title: z.string().trim().min(1, "Informe o título do orçamento.").max(220),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de validade inválida.")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(2000, "Observações muito longas.").optional(),
  discountCents: z.number().int().min(0, "Desconto inválido."),
  discountType: z.enum(quoteDiscountTypes),
  /** Percentual × 100 (10,5% = 1050). Obrigatório quando tipo = percent. */
  discountPercentBps: z
    .number()
    .int()
    .min(0, "Percentual inválido.")
    .max(10000, "O desconto não pode passar de 100%."),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Descreva o item."),
        quantity: z.number().positive("Quantidade deve ser maior que zero."),
        unitPriceCents: z
          .number()
          .int()
          .min(0, "Valor unitário inválido."),
        serviceId: z.uuid().optional().or(z.literal("")),
      }),
    )
    .min(1, "Adicione ao menos um item."),
});

export type QuotePayload = z.infer<typeof quotePayloadSchema>;

// ─────────────────────────── Solicitação de orçamento (portal) ───────────────────────────

/** Pedido de orçamento feito pelo cliente no portal (cria o quote como "requested"). */
export const quoteRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Informe o título do pedido.")
    .max(220, "Máximo de 220 caracteres."),
  serviceId: z.uuid("Selecione o tipo de serviço."),
  /** "YYYY-MM-DD", hoje ou futura (mesmo fuso de referência dos vencimentos). */
  desiredDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de prazo inválida.")
    .refine((value) => value >= businessToday(), {
      message: "O prazo desejado não pode ser uma data passada.",
    }),
  description: z
    .string()
    .trim()
    .min(10, "Descreva o pedido com ao menos 10 caracteres."),
  attachments: z
    .array(demandAttachmentSchema)
    .max(10, "Máximo de 10 arquivos por pedido.")
    .optional(),
});

export type QuoteRequestValues = z.infer<typeof quoteRequestSchema>;

// ─────────────────────────── Resposta do cliente (portal) ───────────────────────────

export const respondQuoteSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000, "Comentário muito longo.").optional(),
});

export type RespondQuoteValues = z.infer<typeof respondQuoteSchema>;

/** Resposta via link público: nome obrigatório (não há sessão para identificar). */
export const respondQuotePublicSchema = z.object({
  action: z.enum(["approved", "rejected"]),
  name: z.string().trim().min(1, "Informe seu nome.").max(160),
  note: z.string().trim().max(1000, "Comentário muito longo.").optional(),
});

export type RespondQuotePublicValues = z.infer<typeof respondQuotePublicSchema>;
