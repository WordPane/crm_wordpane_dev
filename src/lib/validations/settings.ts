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

/** Identidade visual white-label (app_settings["brand.config"]). */
export const brandSettingsSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(1, "Nome do sistema é obrigatório.")
    .max(60, "Máximo de 60 caracteres."),
  /** URL http (blob), fileKey do storage local ou path estático "/brand/...". */
  logoUrl: z.string().trim().min(1, "Envie a logo.").max(500),
  faviconUrl: z.string().trim().min(1, "Envie o favicon.").max(500),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB)."),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB)."),
});

export type BrandSettingsValues = z.infer<typeof brandSettingsSchema>;

/** Dados do emissor exibidos no PDF do orçamento (app_settings["issuer.info"]). */
export const issuerSettingsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Nome de exibição é obrigatório.")
    .max(120, "Máximo de 120 caracteres."),
  razaoSocial: z
    .string()
    .trim()
    .min(1, "Razão social é obrigatória.")
    .max(255, "Máximo de 255 caracteres."),
  cnpj: z
    .string()
    .trim()
    .min(1, "CNPJ é obrigatório.")
    .max(18, "Máximo de 18 caracteres."),
  email: z
    .email("Informe um e-mail válido.")
    .max(255, "Máximo de 255 caracteres."),
  phone: z
    .string()
    .trim()
    .min(1, "Telefone é obrigatório.")
    .max(20, "Máximo de 20 caracteres."),
  addressLine: z
    .string()
    .trim()
    .min(1, "Endereço é obrigatório.")
    .max(255, "Máximo de 255 caracteres."),
  serviceCode: z
    .string()
    .trim()
    .min(1, "Código do serviço é obrigatório.")
    .max(20, "Máximo de 20 caracteres."),
  serviceName: z
    .string()
    .trim()
    .min(1, "Nome do serviço é obrigatório.")
    .max(120, "Máximo de 120 caracteres."),
});

export type IssuerSettingsValues = z.infer<typeof issuerSettingsSchema>;
