import { and, eq, inArray, or, type SQL } from "drizzle-orm";

import { getBranding } from "@/lib/brand/settings";
import { db } from "@/lib/db";
import {
  adminCompanyAssignments,
  charges,
  notifications,
  users,
  type Charge,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/mailer";
import { getEmailSettings } from "@/lib/email/settings";
import type { EmailTemplateRow } from "@/lib/email/templates";
import { formatCurrency, formatDate } from "@/lib/utils/format";

export type NotificationInput = {
  /** comment | demand.created | demand.status | upload | quote.sent | quote.approved | quote.rejected */
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  /** Linhas label/valor exibidas no corpo do e-mail (opcional). */
  rows?: EmailTemplateRow[];
};

/** Insere notificações em lote (deduplica destinatários, ignora lista vazia). */
export async function notifyUsers(
  userIds: string[],
  n: NotificationInput,
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  await db.insert(notifications).values(
    ids.map((userId) => ({
      userId,
      type: n.type,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
    })),
  );
  // E-mail é best-effort: o insert acima é a fonte de verdade e nunca falha por causa de SMTP
  await emailNotificationRecipients(ids, n);
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

    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        sendEmail({
          to: recipient.email,
          subject: n.title,
          title: n.title,
          intro: n.body ?? n.title,
          rows: n.rows,
          cta: n.href
            ? { label: "Ver no CRM", url: `${settings.appUrl}${n.href}` }
            : undefined,
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
  projectName: string;
}): Promise<void> {
  if (!input.ownerId || input.ownerId === input.actorId) return;
  await notifyUsers([input.ownerId], {
    type: "task.assigned",
    title: `Tarefa atribuída a você: ${input.taskTitle}`,
    body: `${input.actorName} atribuiu a tarefa "${input.taskTitle}" para você no projeto ${input.projectName}.`,
    href: `/admin/tarefas/${input.taskId}`,
    rows: [
      { label: "Projeto", value: input.projectName },
      { label: "Tarefa", value: input.taskTitle },
      { label: "Atribuída por", value: input.actorName },
    ],
  });
}

/**
 * Lembrete de cobrança em aberto/vencida para os usuários da empresa
 * (notificação interna + e-mail com o link do portal).
 * Atualiza `lastReminderAt` — usado pelo lembrete diário (cron) e pelo
 * reenvio manual no financeiro.
 */
export async function notifyChargeReminder(charge: Charge): Promise<void> {
  const overdue = charge.status === "overdue";
  const recipients = await clientUsersOfCompany(charge.companyId);
  await notifyUsers(recipients, {
    type: "charge.reminder",
    title: overdue
      ? `Cobrança vencida: ${charge.description}`
      : `Lembrete de cobrança: ${charge.description}`,
    body: overdue
      ? `A cobrança de ${formatCurrency(charge.valueCents)} venceu em ${formatDate(charge.dueDate)} e ainda está em aberto. Regularize pelo portal.`
      : `Lembramos que a cobrança de ${formatCurrency(charge.valueCents)} com vencimento em ${formatDate(charge.dueDate)} segue em aberto.`,
    href: "/portal/financeiro",
    rows: [
      { label: "Descrição", value: charge.description },
      { label: "Valor", value: formatCurrency(charge.valueCents) },
      { label: "Vencimento", value: formatDate(charge.dueDate) },
    ],
  });

  await db
    .update(charges)
    .set({ lastReminderAt: new Date() })
    .where(eq(charges.id, charge.id));
}
