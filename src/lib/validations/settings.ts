import { z } from "zod";

export const statusFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(80, "Máximo de 80 caracteres."),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB)."),
  isFinal: z.boolean(),
  active: z.boolean(),
});

export type StatusFormValues = z.infer<typeof statusFormSchema>;

/** Configuração SMTP gravada em app_settings (chave "email.smtp"). */
export const emailSettingsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1, "Host SMTP é obrigatório.")
    .max(255, "Máximo de 255 caracteres."),
  port: z
    .number("Porta inválida.")
    .int("Porta inválida.")
    .min(1, "Porta inválida.")
    .max(65535, "Porta inválida."),
  secure: z.boolean(),
  user: z
    .string()
    .trim()
    .min(1, "Usuário é obrigatório.")
    .max(255, "Máximo de 255 caracteres."),
  // Vazio = mantém a senha atual
  password: z
    .string()
    .max(255, "Máximo de 255 caracteres.")
    .optional()
    .or(z.literal("")),
  fromEmail: z
    .email("Informe um e-mail válido.")
    .max(255, "Máximo de 255 caracteres."),
  fromName: z
    .string()
    .trim()
    .min(1, "Nome do remetente é obrigatório.")
    .max(120, "Máximo de 120 caracteres."),
  appUrl: z.url("Informe uma URL válida (ex.: https://crm.exemplo.com)."),
});

export type EmailSettingsValues = z.infer<typeof emailSettingsSchema>;

/** Configuração do Asaas gravada em app_settings (chave "asaas.config"). */
export const asaasSettingsSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  // Vazio = mantém a API key atual
  apiKey: z.string().max(255, "Máximo de 255 caracteres.").optional().or(z.literal("")),
});

export type AsaasSettingsValues = z.infer<typeof asaasSettingsSchema>;
