import { and, eq, inArray, or, type SQL } from "drizzle-orm";

import { getPixQrCode } from "@/lib/asaas/client";
import { getBranding } from "@/lib/brand/settings";
import { db } from "@/lib/db";
import {
  adminCompanyAssignments,
  charges,
  notifications,
  users,
  type Charge,
  type NotificationCategory,
  type NotificationSettings,
} from "@/lib/db/schema";
import { sendEmail, type SendEmailQrCode } from "@/lib/email/mailer";
import { getEmailSettings } from "@/lib/email/settings";
import type {
  EmailTemplateCta,
  EmailTemplateRow,
} from "@/lib/email/templates";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";

export type NotificationInput = {
  /** Chave do evento (ex.: comment, demand.created, quote.sent, quote.requested, project.created). */
  type: string;
  title: string;
  body?: string | null;
  /** Se true, `body` contém HTML seguro permitido no e-mail (negrito, itálico, links, listas). */
  bodyIsHtml?: boolean;
  href?: string | null;
  /** Linhas label/valor exibidas no corpo do e-mail (opcional). */
  rows?: EmailTemplateRow[];
  /**
   * CTA customizado do e-mail (padrão: "Ver no CRM" apontando para o href).
   * URL absoluta ou caminho "/..." (resolvido com a appUrl).
   */
  cta?: EmailTemplateCta;
  /** Links secundários do e-mail (ex.: baixar boleto, baixar XML da NF). */
  links?: EmailTemplateCta[];
  /** Bloco PIX do e-mail (QR anexo + copia-e-cola). */
  qrCode?: SendEmailQrCode;
};

function notificationCategory(type: string): NotificationCategory {
  if (type.startsWith("task.")) return "task";
  if (type === "comment" || type.startsWith("comment.")) return "comment";
  if (type.startsWith("project.")) return "project";
  if (type.startsWith("demand.")) return "demand";
  if (type.startsWith("quote.")) return "quote";
  if (type.startsWith("charge.")) return "charge";
  return "system";
}

function channelsForUser(
  settings: NotificationSettings | null,
  category: NotificationCategory,
): { in_app: boolean; email: boolean; digest: boolean } {
  const configured = settings?.channels?.[category] ?? ["in_app", "email"];
  return {
    in_app: configured.includes("in_app"),
    email: configured.includes("email"),
    digest: configured.includes("digest") || settings?.digest === true,
  };
}

/** Insere notificações em lote (deduplica destinatários, ignora lista vazia). */
export async function notifyUsers(
  userIds: string[],
  n: NotificationInput,
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;

  const category = notificationCategory(n.type);
  const userRows = await db
    .select({ id: users.id, settings: users.notificationSettings })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, "active")));

  const inAppIds: string[] = [];
  const emailIds: string[] = [];

  for (const user of userRows) {
    const channels = channelsForUser(user.settings, category);
    if (channels.in_app) inAppIds.push(user.id);
    if (channels.email && !channels.digest) emailIds.push(user.id);
  }

  if (inAppIds.length > 0) {
    await db.insert(notifications).values(
      inAppIds.map((userId) => ({
        userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        href: n.href ?? null,
      })),
    );
  }

  // E-mail é best-effort: nunca falha a notificação principal por causa de SMTP
  await emailNotificationRecipients(emailIds, n);
}

/**
 * notifyUsers que nunca lança: usada no processamento de webhooks, onde
 * uma falha de notificação (insert no banco, SMTP) NÃO pode derrubar o
 * evento — o erro vira log e o processamento segue. Transições de estado
 * continuam podendo falhar normalmente (viram 5xx → reentrega).
 */
export async function notifyUsersSafe(
  userIds: string[],
  n: NotificationInput,
): Promise<void> {
  try {
    await notifyUsers(userIds, n);
  } catch (error) {
    console.error(`Falha ao notificar (${n.type}):`, error);
  }
}

/** Envia a notificação por e-mail aos usuários ativos (nunca lança exceção). */
async function emailNotificationRecipients(
  ids: string[],
  n: NotificationInput,
): Promise<void> {
  try {
    const settings = await getEmailSettings();
    if (!settings) {
      console.warn("Notificações por e-mail ignoradas: SMTP não configurado.");
      return;
    }

    const recipients = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(and(inArray(users.id, ids), eq(users.status, "active")));
    if (recipients.length === 0) return;

    // URLs relativas ("/portal/...") viram absolutas com a appUrl configurada
    const resolveUrl = (url: string) =>
      url.startsWith("/") ? `${settings.appUrl}${url}` : url;
    const cta = n.cta
      ? { label: n.cta.label, url: resolveUrl(n.cta.url) }
      : n.href
        ? { label: "Ver no CRM", url: resolveUrl(n.href) }
        : undefined;
    const links = n.links?.map((link) => ({
      label: link.label,
      url: resolveUrl(link.url),
    }));

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        sendEmail({
          to: recipient.email,
          subject: n.title,
          title: n.title,
          intro: n.body ?? n.title,
          introIsHtml: n.bodyIsHtml,
          rows: n.rows,
          cta,
          links,
          qrCode: n.qrCode,
        }),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `E-mail de notificação para ${recipients[index].email} falhou:`,
          result.reason,
        );
      } else if (!result.value.ok) {
        console.error(
          `E-mail de notificação para ${recipients[index].email} falhou: ${result.value.error}`,
        );
      }
    });
  } catch (error) {
    console.error("Falha ao enviar notificações por e-mail:", error);
  }
}

/**
 * E-mail de boas-vindas (best-effort): 1º usuário de empresa aprovada ou
 * usuário criado manualmente pelo admin. `companyName` presente → texto de
 * cliente do portal; ausente → texto de membro da equipe. `password` é a
 * senha provisória definida pelo admin na criação manual.
 */
export async function sendWelcomeEmail(input: {
  to: string;
  name: string;
  companyName?: string;
  password?: string;
}): Promise<void> {
  try {
    const [settings, brand] = await Promise.all([
      getEmailSettings(),
      getBranding(),
    ]);
    const isClient = Boolean(input.companyName);
    const rows: EmailTemplateRow[] = [];
    if (input.companyName) {
      rows.push({ label: "Empresa", value: input.companyName });
    }
    rows.push({ label: "E-mail de acesso", value: input.to });
    if (input.password) {
      rows.push({ label: "Senha provisória", value: input.password });
    }

    const result = await sendEmail({
      to: input.to,
      subject: isClient
        ? `Seu acesso ao portal ${brand.appName} está ativo`
        : `Sua conta na equipe ${brand.appName} foi criada`,
      title: isClient
        ? `Seu acesso ao portal ${brand.appName} está ativo`
        : `Sua conta na equipe ${brand.appName} foi criada`,
      intro: isClient
        ? `Olá, ${input.name}! O acesso de ${input.companyName} ao portal ${brand.appName} foi liberado. Entre com o seu e-mail e a senha cadastrada para acompanhar projetos, demandas e arquivos.`
        : `Olá, ${input.name}! Sua conta na equipe ${brand.appName} foi criada. Entre com o seu e-mail e a senha cadastrada para acessar o painel.`,
      rows,
      cta: settings
        ? {
            label: isClient ? "Acessar o portal" : "Acessar o painel",
            url: `${settings.appUrl}/login`,
          }
        : undefined,
    });
    if (!result.ok) {
      console.error(`E-mail de boas-vindas para ${input.to} falhou: ${result.error}`);
    }
  } catch (error) {
    console.error(`E-mail de boas-vindas para ${input.to} falhou:`, error);
  }
}

/** Super admins + admins ativos atribuídos à empresa. */
export async function teamUsersOfCompany(companyId: string): Promise<string[]> {
  const assigned = await db
    .select({ adminId: adminCompanyAssignments.adminId })
    .from(adminCompanyAssignments)
    .where(eq(adminCompanyAssignments.companyId, companyId));
  const assignedIds = assigned.map((r) => r.adminId);

  const roleConditions: SQL[] = [eq(users.role, "super_admin")];
  if (assignedIds.length > 0) {
    roleConditions.push(
      and(eq(users.role, "admin"), inArray(users.id, assignedIds))!,
    );
  }

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.status, "active"), or(...roleConditions)));
  return rows.map((r) => r.id);
}

/** Usuários client ativos da empresa. */
export async function clientUsersOfCompany(
  companyId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "client"),
        eq(users.companyId, companyId),
        eq(users.status, "active"),
      ),
    );
  return rows.map((r) => r.id);
}

function taskLink(taskId: string, title: string): string {
  return `<a href="/admin/tarefas/${taskId}" target="_blank">${title}</a>`;
}

function projectLink(projectName: string, projectId: string): string {
  return `<a href="/admin/projetos/${projectId}" target="_blank">${projectName}</a>`;
}

/**
 * Avisa o responsável sobre tarefa com prazo próximo (amanhã).
 */
export async function notifyTaskDueSoon(input: {
  userId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  dueDate: string;
}): Promise<void> {
  await notifyUsers([input.userId], {
    type: "task.due_soon",
    title: `Prazo próximo: "${input.taskTitle}"`,
    body: `A tarefa ${taskLink(input.taskId, input.taskTitle)} vence amanhã (${input.dueDate}) no projeto ${projectLink(input.projectName, input.projectId)}.`,
    bodyIsHtml: true,
    href: `/admin/tarefas/${input.taskId}`,
    rows: [
      { label: "Projeto", value: input.projectName },
      { label: "Tarefa", value: input.taskTitle },
      { label: "Prazo", value: input.dueDate },
    ],
  });
}

/**
 * Avisa o responsável sobre tarefa vencida.
 */
export async function notifyTaskOverdue(input: {
  userId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  dueDate: string;
}): Promise<void> {
  await notifyUsers([input.userId], {
    type: "task.overdue",
    title: `Tarefa vencida: "${input.taskTitle}"`,
    body: `A tarefa ${taskLink(input.taskId, input.taskTitle)} venceu em ${input.dueDate} no projeto ${projectLink(input.projectName, input.projectId)}.`,
    bodyIsHtml: true,
    href: `/admin/tarefas/${input.taskId}`,
    rows: [
      { label: "Projeto", value: input.projectName },
      { label: "Tarefa", value: input.taskTitle },
      { label: "Vencimento", value: input.dueDate },
    ],
  });
}

/**
 * Avisa o novo responsável por uma tarefa (notificação interna + e-mail).
 * Não dispara quando não há responsável ou quando o autor atribui a si mesmo.
 */
export async function notifyTaskAssigned(input: {
  actorId: string;
  actorName: string;
  ownerId: string | null;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
}): Promise<void> {
  if (!input.ownerId || input.ownerId === input.actorId) return;
  await notifyUsers([input.ownerId], {
    type: "task.assigned",
    title: `Tarefa atribuída a você: "${input.taskTitle}"`,
    body: `${input.actorName} atribuiu a tarefa ${taskLink(input.taskId, input.taskTitle)} para você no projeto ${projectLink(input.projectName, input.projectId)}.`,
    bodyIsHtml: true,
    href: `/admin/tarefas/${input.taskId}`,
    rows: [
      { label: "Projeto", value: input.projectName },
      { label: "Tarefa", value: input.taskTitle },
      { label: "Atribuída por", value: input.actorName },
    ],
  });
}

/** Rótulo amigável do meio de pagamento (linhas do e-mail). */
const BILLING_TYPE_LABELS: Record<Charge["billingType"], string> = {
  pix: "PIX",
  boleto: "Boleto bancário",
  credit_card: "Cartão de crédito",
  undefined: "A escolher na página de pagamento",
};

/**
 * Blocos de pagamento do e-mail da cobrança:
 * - CTA com o link direto da cobrança no Asaas (invoiceUrl)
 * - boleto → link secundário para baixar o PDF do boleto
 * - PIX → QR Code anexo + código copia-e-cola (best-effort: se a consulta
 *   ao Asaas falhar, o e-mail sai só com o link)
 * - sempre um link secundário para o portal
 */
async function chargePaymentBlocks(charge: Charge): Promise<{
  cta?: EmailTemplateCta;
  links: EmailTemplateCta[];
  qrCode?: SendEmailQrCode;
}> {
  let cta: EmailTemplateCta | undefined;
  let qrCode: SendEmailQrCode | undefined;
  const links: EmailTemplateCta[] = [];

  if (charge.invoiceUrl) {
    const label =
      charge.billingType === "credit_card"
        ? "Pagar com cartão"
        : charge.billingType === "undefined"
          ? "Pagar agora"
          : "Abrir cobrança no Asaas";
    cta = { label, url: charge.invoiceUrl };
  }

  if (charge.billingType === "boleto" && charge.bankSlipUrl) {
    links.push({ label: "Baixar boleto em PDF", url: charge.bankSlipUrl });
  }

  if (charge.billingType === "pix" && charge.asaasPaymentId) {
    try {
      const qr = await getPixQrCode(charge.asaasPaymentId);
      qrCode = {
        imageBase64: qr.encodedImage,
        payload: qr.payload,
        note: `QR válido até ${formatDateTime(qr.expirationDate)}. Depois do pagamento, a confirmação chega em instantes.`,
      };
    } catch (error) {
      console.error(
        `QR PIX da cobrança ${charge.id} não entrou no e-mail:`,
        error,
      );
    }
  }

  links.push({ label: "Acompanhar no portal", url: "/portal/financeiro" });

  return { cta, links, qrCode };
}

/** Introdução do e-mail de cobrança criada, conforme o meio de pagamento. */
function chargeCreatedIntro(charge: Charge): string {
  const base = `Uma cobrança no valor de ${formatCurrency(charge.valueCents)} com vencimento em ${formatDate(charge.dueDate)} foi gerada para a sua empresa.`;
  switch (charge.billingType) {
    case "pix":
      return `${base} Pague agora escaneando o QR Code abaixo, ou abra a cobrança no Asaas pelo botão.`;
    case "boleto":
      return `${base} O boleto já está disponível para download — pague pelo link abaixo ou abra a cobrança no Asaas.`;
    case "credit_card":
      return `${base} Pague com cartão de crédito pelo link abaixo.`;
    default:
      return `${base} Escolha a forma de pagamento (PIX, boleto ou cartão) na página da cobrança.`;
  }
}

function chargeRows(charge: Charge): EmailTemplateRow[] {
  return [
    { label: "Descrição", value: charge.description },
    { label: "Valor", value: formatCurrency(charge.valueCents) },
    { label: "Vencimento", value: formatDate(charge.dueDate) },
    { label: "Forma de pagamento", value: BILLING_TYPE_LABELS[charge.billingType] },
  ];
}

/**
 * Notifica os usuários da empresa sobre uma nova cobrança (notificação
 * interna + e-mail com link direto da cobrança, boleto ou QR PIX).
 */
export async function notifyChargeCreated(chargeId: string): Promise<void> {
  const [charge] = await db
    .select()
    .from(charges)
    .where(eq(charges.id, chargeId))
    .limit(1);
  if (!charge) return;

  const recipients = await clientUsersOfCompany(charge.companyId);
  const payment = await chargePaymentBlocks(charge);
  await notifyUsers(recipients, {
    type: "charge.created",
    title: `Nova cobrança: ${charge.description}`,
    body: chargeCreatedIntro(charge),
    href: "/portal/financeiro",
    rows: chargeRows(charge),
    cta: payment.cta,
    links: payment.links,
    qrCode: payment.qrCode,
  });
}

/**
 * Lembrete de cobrança em aberto/vencida para os usuários da empresa
 * (notificação interna + e-mail com os mesmos blocos de pagamento).
 * Atualiza `lastReminderAt` — usado pelo lembrete diário (cron) e pelo
 * reenvio manual no financeiro.
 */
export async function notifyChargeReminder(charge: Charge): Promise<void> {
  const overdue = charge.status === "overdue";
  const recipients = await clientUsersOfCompany(charge.companyId);
  const payment = await chargePaymentBlocks(charge);
  await notifyUsers(recipients, {
    type: "charge.reminder",
    title: overdue
      ? `Cobrança vencida: ${charge.description}`
      : `Lembrete de cobrança: ${charge.description}`,
    body: overdue
      ? `A cobrança de ${formatCurrency(charge.valueCents)} venceu em ${formatDate(charge.dueDate)} e ainda está em aberto. Regularize agora pelo link abaixo${charge.billingType === "pix" ? " ou pelo QR Code PIX" : ""}.`
      : `Lembramos que a cobrança de ${formatCurrency(charge.valueCents)} com vencimento em ${formatDate(charge.dueDate)} segue em aberto. Pague pelo link abaixo${charge.billingType === "pix" ? " ou pelo QR Code PIX" : ""}.`,
    href: "/portal/financeiro",
    rows: chargeRows(charge),
    cta: payment.cta,
    links: payment.links,
    qrCode: payment.qrCode,
  });

  await db
    .update(charges)
    .set({ lastReminderAt: new Date() })
    .where(eq(charges.id, charge.id));
}
