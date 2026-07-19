import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// ─────────────────────────── Enums ───────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  "client",
]);
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "invited",
  "suspended",
]);
export const companyStatusEnum = pgEnum("company_status", [
  "ativo",
  "inativo",
  "prospect",
]);
export const projectTypeEnum = pgEnum("project_type", [
  "site_institucional",
  "landing_page",
  "sistema_web",
  "saas",
  "integracao",
  "api",
  "outro",
]);
export const priorityEnum = pgEnum("priority", [
  "baixa",
  "media",
  "alta",
  "urgente",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "pendente",
  "em_andamento",
  "concluida",
]);
export const taskOriginEnum = pgEnum("task_origin", [
  "interna",
  "demanda_cliente",
]);
export const demandStatusEnum = pgEnum("demand_status", [
  "aberta",
  "em_analise",
  "em_andamento",
  "concluida",
  "recusada",
]);
export const demandCategoryEnum = pgEnum("demand_category", [
  "suporte",
  "alteracao",
  "nova_funcionalidade",
  "correcao",
  "outro",
]);
export const registrationStatusEnum = pgEnum("registration_status", [
  "pendente",
  "aprovado",
  "recusado",
]);
export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "approved",
  "rejected",
]);
export const serviceBillingEnum = pgEnum("service_billing", [
  "one_time",
  "recurring",
]);
export const subscriptionCycleEnum = pgEnum("subscription_cycle", [
  "weekly",
  "monthly",
  "quarterly",
  "semiannually",
  "yearly",
]);
export const chargeBillingTypeEnum = pgEnum("charge_billing_type", [
  "pix",
  "boleto",
  "credit_card",
  "undefined",
]);
export const chargeStatusEnum = pgEnum("charge_status", [
  "pending",
  "confirmed",
  "received",
  "overdue",
  "refunded",
  "cancelled",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "scheduled",
  "synchronized",
  "authorized",
  "error",
  "canceled",
]);
export const personTypeEnum = pgEnum("person_type", ["pj", "pf"]);

// ─────────────────────────── Empresas (clientes) ───────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
    nomeFantasia: varchar("nome_fantasia", { length: 255 }),
    personType: personTypeEnum("person_type").notNull().default("pj"), // pj = CNPJ, pf = CPF
    cnpj: varchar("cnpj", { length: 18 }), // CNPJ ou CPF, conforme personType
    inscricaoEstadual: varchar("inscricao_estadual", { length: 30 }),
    logradouro: varchar("logradouro", { length: 255 }),
    numero: varchar("numero", { length: 20 }),
    complemento: varchar("complemento", { length: 120 }),
    bairro: varchar("bairro", { length: 120 }),
    cidade: varchar("cidade", { length: 120 }),
    estado: varchar("estado", { length: 2 }),
    cep: varchar("cep", { length: 9 }),
    pais: varchar("pais", { length: 60 }).notNull().default("Brasil"),
    telefone: varchar("telefone", { length: 20 }),
    whatsapp: varchar("whatsapp", { length: 20 }),
    site: varchar("site", { length: 255 }),
    email: varchar("email", { length: 255 }),
    status: companyStatusEnum("status").notNull().default("ativo"),
    observacoes: text("observacoes"),
    asaasCustomerId: varchar("asaas_customer_id", { length: 40 }), // cliente no Asaas (criado sob demanda)
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("companies_cnpj_key").on(t.cnpj)],
);

// ─────────────────────────── Usuários ───────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    phone: varchar("phone", { length: 20 }),
    position: varchar("position", { length: 120 }), // cargo
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("client"),
    status: userStatusEnum("status").notNull().default("active"),
    // Só tem significado para role "client": gerencia os usuários da própria empresa
    isCompanyAdmin: boolean("is_company_admin").notNull().default(false),
    // Preenchido apenas para usuários clientes (portal)
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    index("users_company_idx").on(t.companyId),
  ],
);

// Admins (não super) só enxergam empresas atribuídas
export const adminCompanyAssignments = pgTable(
  "admin_company_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("admin_company_unique").on(t.adminId, t.companyId),
    index("admin_company_company_idx").on(t.companyId),
  ],
);

// ─────────────────────────── Status configuráveis ───────────────────────────

export const projectStatuses = pgTable("project_statuses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  color: varchar("color", { length: 20 }).notNull().default("#00d164"),
  position: integer("position").notNull().default(0),
  isFinal: boolean("is_final").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const taskStatuses = pgTable("task_statuses", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  color: varchar("color", { length: 20 }).notNull().default("#00d164"),
  position: integer("position").notNull().default(0),
  isFinal: boolean("is_final").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────── Projetos ───────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    type: projectTypeEnum("type").notNull().default("outro"),
    statusId: uuid("status_id").references(() => projectStatuses.id),
    ownerId: uuid("owner_id").references(() => users.id), // responsável
    startDate: date("start_date"),
    dueDate: date("due_date"),
    priority: priorityEnum("priority").notNull().default("media"),
    createdBy: uuid("created_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("projects_company_idx").on(t.companyId),
    index("projects_status_idx").on(t.statusId),
    index("projects_due_idx").on(t.dueDate),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("project_members_unique").on(t.projectId, t.userId)],
);

// ─────────────────────────── Etapas (milestones) ───────────────────────────

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    ownerId: uuid("owner_id").references(() => users.id),
    status: milestoneStatusEnum("status").notNull().default("pendente"),
    position: integer("position").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);

// ─────────────────────────── Tarefas ───────────────────────────

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description"),
    ownerId: uuid("owner_id").references(() => users.id),
    priority: priorityEnum("priority").notNull().default("media"),
    dueDate: date("due_date"),
    statusId: uuid("status_id").references(() => taskStatuses.id),
    origin: taskOriginEnum("origin").notNull().default("interna"),
    visibleToClient: boolean("visible_to_client").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_milestone_idx").on(t.milestoneId),
    index("tasks_status_idx").on(t.statusId),
    index("tasks_due_idx").on(t.dueDate),
  ],
);

export const taskChecklistItems = pgTable(
  "task_checklist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 300 }).notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("checklist_task_idx").on(t.taskId)],
);

// ─────────────────────────── Comentários ───────────────────────────

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("comments_task_idx").on(t.taskId)],
);

// ─────────────────────────── Arquivos ───────────────────────────

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "cascade",
    }),
    demandId: uuid("demand_id"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileKey: text("file_key").notNull(), // path local ou URL do blob
    fileSize: integer("file_size").notNull().default(0),
    mimeType: varchar("mime_type", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attachments_project_idx").on(t.projectId),
    index("attachments_task_idx").on(t.taskId),
  ],
);

// ─────────────────────────── Demandas (portal do cliente) ───────────────────────────

export const demands = pgTable(
  "demands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }), // projeto ao qual a demanda se refere
    title: varchar("title", { length: 220 }).notNull(),
    description: text("description").notNull(),
    category: demandCategoryEnum("category").notNull().default("outro"),
    priority: priorityEnum("priority").notNull().default("media"),
    status: demandStatusEnum("status").notNull().default("aberta"),
    taskId: uuid("demands_task_id"), // tarefa gerada para a equipe
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("demands_company_idx").on(t.companyId),
    index("demands_status_idx").on(t.status),
    index("demands_project_idx").on(t.projectId),
  ],
);

// ─────────────────────────── Orçamentos ───────────────────────────

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: serial("number").notNull(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 220 }).notNull(),
    notes: text("notes"), // condições, prazos, observações exibidas no orçamento
    status: quoteStatusEnum("status").notNull().default("draft"),
    validUntil: date("valid_until"),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedBy: uuid("responded_by").references(() => users.id),
    responseNote: text("response_note"), // comentário/motivo do cliente
    projectId: uuid("project_id").references(() => projects.id), // projeto gerado
    publicToken: uuid("public_token").notNull().defaultRandom(), // link público de aprovação
    version: integer("version").notNull().default(1), // revisão (duplicar = nova versão)
    duplicatedFromId: uuid("duplicated_from_id").references(
      (): AnyPgColumn => quotes.id,
    ),
    respondedName: varchar("responded_name", { length: 160 }), // nome informado no link público
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("quotes_number_key").on(t.number),
    uniqueIndex("quotes_public_token_key").on(t.publicToken),
    index("quotes_company_idx").on(t.companyId),
    index("quotes_status_idx").on(t.status),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId)],
);

// ─────────────────────────── Financeiro ───────────────────────────

/** Catálogo de serviços oferecidos (desenvolvimento, manutenção etc.). */
export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  defaultValueCents: integer("default_value_cents").notNull(),
  billing: serviceBillingEnum("billing").notNull().default("one_time"),
  cycle: subscriptionCycleEnum("cycle").notNull().default("monthly"), // só se recurring
  serviceCode: varchar("service_code", { length: 20 }), // código municipal NFS-e (vazio = padrão do emissor)
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Serviço ativado para uma empresa (assinatura no Asaas quando recorrente). */
export const companyServices = pgTable(
  "company_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    valueCents: integer("value_cents").notNull(), // valor negociado (override do padrão)
    billingType: chargeBillingTypeEnum("billing_type").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | cancelled
    asaasSubscriptionId: varchar("asaas_subscription_id", { length: 40 }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("company_services_company_idx").on(t.companyId),
    index("company_services_service_idx").on(t.serviceId),
  ],
);

/** Cobranças (faturas) — avulsas, de orçamento ou geradas por assinatura. */
export const charges = pgTable(
  "charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id").references(() => quotes.id, {
      onDelete: "set null",
    }), // fatura originada de orçamento aprovado
    companyServiceId: uuid("company_service_id").references(
      () => companyServices.id,
      { onDelete: "set null" },
    ), // origem recorrente
    description: text("description").notNull(),
    valueCents: integer("value_cents").notNull(),
    billingType: chargeBillingTypeEnum("billing_type").notNull(),
    dueDate: date("due_date").notNull(),
    status: chargeStatusEnum("status").notNull().default("pending"),
    asaasPaymentId: varchar("asaas_payment_id", { length: 40 }),
    invoiceUrl: text("invoice_url"),
    bankSlipUrl: text("bank_slip_url"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id), // null = via webhook
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("charges_asaas_payment_key").on(t.asaasPaymentId),
    index("charges_company_idx").on(t.companyId),
    index("charges_status_idx").on(t.status),
    index("charges_due_idx").on(t.dueDate),
  ],
);

/** Notas fiscais de serviço (NFS-e) emitidas via Asaas após o pagamento. */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "cascade" }),
    asaasInvoiceId: varchar("asaas_invoice_id", { length: 40 }),
    status: invoiceStatusEnum("status").notNull().default("scheduled"),
    number: varchar("number", { length: 40 }),
    pdfKey: text("pdf_key"), // PDF da nota no storage interno
    xmlKey: text("xml_key"), // XML da nota no storage interno
    asaasPdfUrl: text("asaas_pdf_url"),
    asaasXmlUrl: text("asaas_xml_url"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_charge_key").on(t.chargeId), // 1 NF por cobrança
    index("invoices_status_idx").on(t.status),
  ],
);

/** Dedup de webhooks do Asaas (entrega at-least-once). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // evt_... do Asaas
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────── Cadastro público (aprovação manual) ───────────────────────────

export const clientRegistrations = pgTable(
  "client_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Empresa
    razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
    nomeFantasia: varchar("nome_fantasia", { length: 255 }),
    personType: personTypeEnum("person_type").notNull().default("pj"),
    cnpj: varchar("cnpj", { length: 18 }),
    telefone: varchar("telefone", { length: 20 }),
    whatsapp: varchar("whatsapp", { length: 20 }),
    email: varchar("email", { length: 255 }),
    site: varchar("site", { length: 255 }),
    cidade: varchar("cidade", { length: 120 }),
    estado: varchar("estado", { length: 2 }),
    mensagem: text("mensagem"), // "conte o que precisa" (opcional)
    // Responsável (será o 1º usuário, admin da empresa)
    userName: varchar("user_name", { length: 160 }).notNull(),
    userEmail: varchar("user_email", { length: 255 }).notNull(),
    userPasswordHash: text("user_password_hash").notNull(),
    userPhone: varchar("user_phone", { length: 20 }),
    userPosition: varchar("user_position", { length: 120 }),
    // Triagem
    status: registrationStatusEnum("status").notNull().default("pendente"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedCompanyId: uuid("approved_company_id").references(
      () => companies.id,
    ),
    approvedUserId: uuid("approved_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("client_registrations_status_created_idx").on(t.status, t.createdAt),
    index("client_registrations_user_email_idx").on(t.userEmail),
  ],
);

// ─────────────────────────── Links temporários ───────────────────────────

export const projectLinks = pgTable(
  "project_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: varchar("description", { length: 255 }),
    version: varchar("version", { length: 40 }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("project_links_project_idx").on(t.projectId)],
);

// ─────────────────────────── Atividades (timeline + histórico) ───────────────────────────

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    entityType: varchar("entity_type", { length: 40 }).notNull(), // project | milestone | task | comment | attachment | demand | link | company
    entityId: uuid("entity_id"),
    action: varchar("action", { length: 60 }).notNull(), // ex.: project.created, task.status_changed
    metadata: jsonb("metadata"), // valores antes/depois, títulos etc.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activities_project_idx").on(t.projectId, t.createdAt),
    index("activities_company_idx").on(t.companyId, t.createdAt),
    index("activities_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ─────────────────────────── Notificações internas ───────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 60 }).notNull(),
    title: varchar("title", { length: 220 }).notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

// ─────────────────────────── Configurações da aplicação ───────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────── Relations ───────────────────────────

export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  admins: many(adminCompanyAssignments),
  projects: many(projects),
  demands: many(demands),
  activities: many(activities),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  assignments: many(adminCompanyAssignments),
  projectMemberships: many(projectMembers),
  comments: many(comments),
  notifications: many(notifications),
}));

export const adminCompanyAssignmentsRelations = relations(
  adminCompanyAssignments,
  ({ one }) => ({
    admin: one(users, {
      fields: [adminCompanyAssignments.adminId],
      references: [users.id],
    }),
    company: one(companies, {
      fields: [adminCompanyAssignments.companyId],
      references: [companies.id],
    }),
  }),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, {
    fields: [projects.companyId],
    references: [companies.id],
  }),
  status: one(projectStatuses, {
    fields: [projects.statusId],
    references: [projectStatuses.id],
  }),
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  members: many(projectMembers),
  milestones: many(milestones),
  tasks: many(tasks),
  links: many(projectLinks),
  attachments: many(attachments),
  activities: many(activities),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
  owner: one(users, { fields: [milestones.ownerId], references: [users.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  milestone: one(milestones, {
    fields: [tasks.milestoneId],
    references: [milestones.id],
  }),
  status: one(taskStatuses, {
    fields: [tasks.statusId],
    references: [taskStatuses.id],
  }),
  owner: one(users, { fields: [tasks.ownerId], references: [users.id] }),
  checklist: many(taskChecklistItems),
  comments: many(comments),
  attachments: many(attachments),
}));

export const taskChecklistItemsRelations = relations(
  taskChecklistItems,
  ({ one }) => ({
    task: one(tasks, {
      fields: [taskChecklistItems.taskId],
      references: [tasks.id],
    }),
  }),
);

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  project: one(projects, {
    fields: [attachments.projectId],
    references: [projects.id],
  }),
  task: one(tasks, { fields: [attachments.taskId], references: [tasks.id] }),
  uploader: one(users, {
    fields: [attachments.uploadedBy],
    references: [users.id],
  }),
}));

export const demandsRelations = relations(demands, ({ one }) => ({
  company: one(companies, {
    fields: [demands.companyId],
    references: [companies.id],
  }),
  author: one(users, { fields: [demands.createdBy], references: [users.id] }),
  project: one(projects, {
    fields: [demands.projectId],
    references: [projects.id],
  }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  company: one(companies, {
    fields: [quotes.companyId],
    references: [companies.id],
  }),
  creator: one(users, { fields: [quotes.createdBy], references: [users.id] }),
  responder: one(users, {
    fields: [quotes.respondedBy],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [quotes.projectId],
    references: [projects.id],
  }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteItems.quoteId],
    references: [quotes.id],
  }),
}));

export const servicesRelations = relations(services, ({ many }) => ({
  companyServices: many(companyServices),
}));

export const companyServicesRelations = relations(
  companyServices,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [companyServices.companyId],
      references: [companies.id],
    }),
    service: one(services, {
      fields: [companyServices.serviceId],
      references: [services.id],
    }),
    charges: many(charges),
  }),
);

export const chargesRelations = relations(charges, ({ one }) => ({
  company: one(companies, {
    fields: [charges.companyId],
    references: [companies.id],
  }),
  quote: one(quotes, { fields: [charges.quoteId], references: [quotes.id] }),
  companyService: one(companyServices, {
    fields: [charges.companyServiceId],
    references: [companyServices.id],
  }),
  creator: one(users, { fields: [charges.createdBy], references: [users.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  charge: one(charges, {
    fields: [invoices.chargeId],
    references: [charges.id],
  }),
}));

export const projectLinksRelations = relations(projectLinks, ({ one }) => ({
  project: one(projects, {
    fields: [projectLinks.projectId],
    references: [projects.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  actor: one(users, { fields: [activities.actorId], references: [users.id] }),
  project: one(projects, {
    fields: [activities.projectId],
    references: [projects.id],
  }),
  company: one(companies, {
    fields: [activities.companyId],
    references: [companies.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─────────────────────────── Tipos ───────────────────────────

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectStatus = typeof projectStatuses.$inferSelect;
export type TaskStatus = typeof taskStatuses.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskChecklistItem = typeof taskChecklistItems.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Demand = typeof demands.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type NewQuoteItem = typeof quoteItems.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type CompanyService = typeof companyServices.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type NewCharge = typeof charges.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type ClientRegistration = typeof clientRegistrations.$inferSelect;
export type NewClientRegistration = typeof clientRegistrations.$inferInsert;
export type ProjectLink = typeof projectLinks.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
