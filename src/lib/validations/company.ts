import { z } from "zod";

import type { Company } from "@/lib/db/schema";

export const companyStatuses = ["ativo", "inativo", "prospect"] as const;
export const personTypes = ["pj", "pf"] as const;
export const personTypeLabels: Record<Company["personType"], string> = {
  pj: "Pessoa jurídica (CNPJ)",
  pf: "Pessoa física (CPF)",
};
export const invoiceEmissions = ["apos_pagamento", "junto_cobranca"] as const;
export const invoiceEmissionLabels: Record<
  Company["invoiceEmission"],
  string
> = {
  apos_pagamento: "Após o pagamento",
  junto_cobranca: "Junto com a cobrança",
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

export const companyFormSchema = z
  .object({
    razaoSocial: z
      .string()
      .trim()
      .min(1, "Razão social é obrigatória.")
      .max(255, "Máximo de 255 caracteres."),
    nomeFantasia: optionalText(255),
    personType: z.enum(personTypes),
    cnpj: optionalText(18),
    inscricaoEstadual: optionalText(30),
    logradouro: optionalText(255),
    numero: optionalText(20),
    complemento: optionalText(120),
    bairro: optionalText(120),
    cidade: optionalText(120),
    estado: z
      .string()
      .trim()
      .toUpperCase()
      .length(2, "Informe a UF (2 letras).")
      .optional()
      .or(z.literal("")),
    cep: optionalText(9),
    pais: z
      .string()
      .trim()
      .min(1, "País é obrigatório.")
      .max(60, "Máximo de 60 caracteres."),
    telefone: optionalText(20),
    whatsapp: optionalText(20),
    site: optionalText(255),
    email: z
      .email("Informe um e-mail válido.")
      .max(255, "Máximo de 255 caracteres.")
      .optional()
      .or(z.literal("")),
    status: z.enum(companyStatuses),
    invoiceEmission: z.enum(invoiceEmissions),
    observacoes: optionalText(5000),
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

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

export const emptyCompanyValues: CompanyFormValues = {
  razaoSocial: "",
  nomeFantasia: "",
  personType: "pj",
  cnpj: "",
  inscricaoEstadual: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  cep: "",
  pais: "Brasil",
  telefone: "",
  whatsapp: "",
  site: "",
  email: "",
  status: "ativo",
  invoiceEmission: "apos_pagamento",
  observacoes: "",
};

/** Converte o registro do banco para os valores do formulário. */
export function companyToFormValues(company: Company): CompanyFormValues {
  return {
    razaoSocial: company.razaoSocial,
    nomeFantasia: company.nomeFantasia ?? "",
    personType: company.personType,
    cnpj: company.cnpj ?? "",
    inscricaoEstadual: company.inscricaoEstadual ?? "",
    logradouro: company.logradouro ?? "",
    numero: company.numero ?? "",
    complemento: company.complemento ?? "",
    bairro: company.bairro ?? "",
    cidade: company.cidade ?? "",
    estado: company.estado ?? "",
    cep: company.cep ?? "",
    pais: company.pais,
    telefone: company.telefone ?? "",
    whatsapp: company.whatsapp ?? "",
    site: company.site ?? "",
    email: company.email ?? "",
    status: company.status,
    invoiceEmission: company.invoiceEmission,
    observacoes: company.observacoes ?? "",
  };
}
