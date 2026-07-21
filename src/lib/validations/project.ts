import { z } from "zod";

import type { Milestone, Project } from "@/lib/db/schema";

export const projectTypes = [
  "site_institucional",
  "landing_page",
  "sistema_web",
  "saas",
  "integracao",
  "api",
  "outro",
] as const;

export const projectTypeLabels: Record<Project["type"], string> = {
  site_institucional: "Site Institucional",
  landing_page: "Landing Page",
  sistema_web: "Sistema Web",
  saas: "SaaS",
  integracao: "Integração",
  api: "API",
  outro: "Outro",
};

export const priorities = ["baixa", "media", "alta", "urgente"] as const;

export const priorityLabels: Record<Project["priority"], string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const milestoneStatuses = [
  "pendente",
  "em_andamento",
  "concluida",
] as const;

export const milestoneStatusLabels: Record<Milestone["status"], string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

/** Campo de texto opcional: aceita vazio (""), limita o tamanho. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .optional()
    .or(z.literal(""));

/** UUID opcional vindo de selects ("" = nenhum). */
const optionalId = z.uuid("Selecione uma opção válida.").optional().or(z.literal(""));

/** Data opcional no formato do input type=date (yyyy-mm-dd). */
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .optional()
  .or(z.literal(""));

export const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(200, "Máximo de 200 caracteres."),
  companyId: z.uuid("Selecione a empresa."),
  type: z.enum(projectTypes),
  statusId: optionalId,
  ownerId: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
  priority: z.enum(priorities),
  description: optionalText(5000),
  /** Modelo aplicado na criação (etapas + tarefas prontas). */
  templateId: optionalId,
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const emptyProjectValues: Omit<ProjectFormValues, "companyId"> & {
  companyId: string;
} = {
  name: "",
  companyId: "",
  type: "site_institucional",
  statusId: "",
  ownerId: "",
  startDate: "",
  dueDate: "",
  priority: "media",
  description: "",
  templateId: "",
};

/** Converte o registro do banco para os valores do formulário. */
export function projectToFormValues(project: Project): ProjectFormValues {
  return {
    name: project.name,
    companyId: project.companyId,
    type: project.type,
    statusId: project.statusId ?? "",
    ownerId: project.ownerId ?? "",
    startDate: project.startDate ?? "",
    dueDate: project.dueDate ?? "",
    priority: project.priority,
    description: project.description ?? "",
    templateId: "",
  };
}

export const milestoneFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(160, "Máximo de 160 caracteres."),
  description: optionalText(2000),
  dueDate: optionalDate,
  ownerId: optionalId,
});

export type MilestoneFormValues = z.infer<typeof milestoneFormSchema>;
