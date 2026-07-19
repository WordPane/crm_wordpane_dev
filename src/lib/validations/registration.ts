import { z } from "zod";

import type { ClientRegistration } from "@/lib/db/schema";

export const registrationStatuses = [
  "pendente",
  "aprovado",
  "recusado",
] as const;

export const registrationStatusLabels: Record<
  ClientRegistration["status"],
  string
> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

const CNPJ_REGEX = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

/** Campo de texto opcional: aceita vazio (""), limita o tamanho. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

/** Cadastro público de empresa — aprovado manualmente pela equipe. */
export const registrationFormSchema = z
  .object({
    // Dados da empresa
    razaoSocial: z
      .string()
      .trim()
      .min(1, "Razão social é obrigatória.")
      .max(255, "Máximo de 255 caracteres."),
    nomeFantasia: optionalText(255),
    personType: z.enum(["pj", "pf"]),
    cnpj: optionalText(18),
    telefone: optionalText(20),
    whatsapp: optionalText(20),
    email: z
      .email("Informe um e-mail válido.")
      .max(255, "Máximo de 255 caracteres.")
      .optional()
      .or(z.literal("")),
    site: optionalText(255),
    cidade: optionalText(120),
    estado: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, "Informe a UF (2 letras).")
      .optional()
      .or(z.literal("")),
    mensagem: optionalText(5000),
    // Acesso do responsável (1º usuário, admin da empresa)
    userName: z
      .string()
      .trim()
      .min(1, "Seu nome é obrigatório.")
      .max(160, "Máximo de 160 caracteres."),
    userEmail: z
      .email("Informe um e-mail válido.")
      .max(255, "Máximo de 255 caracteres."),
    // bcrypt considera no máximo 72 bytes de senha
    userPassword: z
      .string()
      .min(6, "A senha deve ter ao menos 6 caracteres.")
      .max(72, "Máximo de 72 caracteres."),
    userPasswordConfirm: z.string(),
    userPhone: optionalText(20),
    userPosition: optionalText(120),
    // Honeypot anti-bot: humanos não veem nem preenchem este campo
    empresa: z.string().max(255).optional().or(z.literal("")),
  })
  .refine((values) => values.userPassword === values.userPasswordConfirm, {
    message: "As senhas não conferem.",
    path: ["userPasswordConfirm"],
  })
  .superRefine((values, ctx) => {
    const doc = values.cnpj?.trim() ?? "";
    if (!doc) return;
    if (values.personType === "pf" && !CPF_REGEX.test(doc)) {
      ctx.addIssue({
        code: "custom",
        path: ["cnpj"],
        message: "Use o formato 000.000.000-00.",
      });
    }
    if (values.personType === "pj" && !CNPJ_REGEX.test(doc)) {
      ctx.addIssue({
        code: "custom",
        path: ["cnpj"],
        message: "Use o formato 00.000.000/0000-00.",
      });
    }
  });

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

export const emptyRegistrationValues: RegistrationFormValues = {
  razaoSocial: "",
  nomeFantasia: "",
  personType: "pj",
  cnpj: "",
  telefone: "",
  whatsapp: "",
  email: "",
  site: "",
  cidade: "",
  estado: "",
  mensagem: "",
  userName: "",
  userEmail: "",
  userPassword: "",
  userPasswordConfirm: "",
  userPhone: "",
  userPosition: "",
  empresa: "",
};

/** Recusa de cadastro exige justificativa interna. */
export const rejectRegistrationSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "Informe o motivo da recusa.")
    .max(2000, "Máximo de 2000 caracteres."),
});

export type RejectRegistrationValues = z.infer<typeof rejectRegistrationSchema>;
