import { addDays, format, parseISO } from "date-fns";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logActivity } from "@/lib/activities";
import { AsaasError, createPayment, ensureCustomer } from "@/lib/asaas/client";
import { db } from "@/lib/db";
import {
  charges,
  projectMembers,
  projects,
  projectStatuses,
  quoteItems,
  quotes,
  serviceTeamMembers,
  services,
  users,
  type Quote,
  type Service,
} from "@/lib/db/schema";
import { emitInvoiceForNewCharge } from "@/lib/invoices";
import {
  clientUsersOfCompany,
  notifyChargeCreated,
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { materializeProjectTemplate } from "@/lib/project-templates";
import {
  businessToday,
  formatCurrency,
  formatDate,
  formatQuoteNumber,
} from "@/lib/utils/format";

/**
 * Núcleo de `createChargeFromQuote` SEM auth: gera a cobrança de um
 * orçamento aprovado (registro local + payment no Asaas + NF conforme
 * configuração da empresa + log + notificação ao cliente).
 * `createdBy` null = cobrança gerada pelo sistema (automação).
 * Erros viram `{ ok: false, error }` — nunca lança exceção.
 */
export async function generateChargeForQuote(input: {
  quote: Quote;
  billingType: "pix" | "boleto" | "credit_card" | "undefined";
  /** "yyyy-MM-dd" */
  dueDate: string;
  /** null = sistema */
  createdBy: string | null;
}): Promise<{ ok: true; chargeId: string } | { ok: false; error: string }> {
  try {
    const { quote } = input;

    const [existing] = await db
      .select({ id: charges.id })
      .from(charges)
      .where(eq(charges.quoteId, quote.id))
      .limit(1);
    if (existing) {
      return { ok: false, error: "Este orçamento já possui uma cobrança." };
    }

    const number = formatQuoteNumber(quote.number);
    const description = `${number} — ${quote.title}`;

    const [charge] = await db
      .insert(charges)
      .values({
        companyId: quote.companyId,
        quoteId: quote.id,
        description,
        valueCents: quote.totalCents,
        billingType: input.billingType,
        dueDate: input.dueDate,
        createdBy: input.createdBy,
      })
      .returning({ id: charges.id });

    try {
      const customerId = await ensureCustomer(quote.companyId);
      const payment = await createPayment({
        customerId,
        billingType: input.billingType,
        valueCents: quote.totalCents,
        dueDate: input.dueDate,
        description,
        externalReference: charge.id,
      });
      await db
        .update(charges)
        .set({
          asaasPaymentId: payment.id,
          invoiceUrl: payment.invoiceUrl ?? null,
          bankSlipUrl: payment.bankSlipUrl ?? null,
        })
        .where(eq(charges.id, charge.id));
    } catch (error) {
      // Falhou no Asaas → remove o registro local para não ficar cobrança fantasma
      await db.delete(charges).where(eq(charges.id, charge.id));
      throw error;
    }

    // Empresa configurada para emitir a NF junto com a cobrança
    await emitInvoiceForNewCharge(quote.companyId, charge.id);

    await logActivity({
      actorId: input.createdBy,
      companyId: quote.companyId,
      entityType: "charge",
      entityId: charge.id,
      action: "charge.created",
      metadata: {
        description,
        value: formatCurrency(quote.totalCents),
        quote: number,
      },
    });
    await notifyChargeCreated(
      quote.companyId,
      description,
      quote.totalCents,
      input.dueDate,
    );

    return { ok: true, chargeId: charge.id };
  } catch (error) {
    if (error instanceof AsaasError) return { ok: false, error: error.message };
    // Loga a causa real (o drizzle embrulha o erro do pg em .cause)
    console.error(error instanceof Error ? (error.cause ?? error) : error);
    return {
      ok: false,
      error: "Não foi possível concluir a operação. Tente novamente.",
    };
  }
}

/**
 * Automação disparada pela aprovação de um orçamento (portal ou link
 * público): cria o projeto a partir do pedido, aplica o modelo de etapas do
 * serviço, monta a equipe do projeto e gera a cobrança.
 * Best-effort total: nunca lança — em falha, loga e avisa a equipe para
 * concluir manualmente. Idempotente: sai se já existe projeto vinculado.
 */
export async function automateApprovedQuote(quoteId: string): Promise<void> {
  try {
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote || quote.status !== "approved" || quote.projectId) return;

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId))
      .orderBy(asc(quoteItems.position));

    // Serviço de origem do pedido: define modelo de etapas e equipe padrão
    let service: Service | null = null;
    if (quote.serviceId) {
      const [row] = await db
        .select()
        .from(services)
        .where(eq(services.id, quote.serviceId))
        .limit(1);
      service = row ?? null;
    }

    // Equipe do serviço: usuários ativos da equipe interna, por nome
    let memberIds: string[] = [];
    if (service) {
      const rows = await db
        .select({ id: users.id })
        .from(serviceTeamMembers)
        .innerJoin(users, eq(serviceTeamMembers.userId, users.id))
        .where(
          and(
            eq(serviceTeamMembers.serviceId, service.id),
            eq(users.status, "active"),
            inArray(users.role, ["admin", "super_admin"]),
          ),
        )
        .orderBy(asc(users.name));
      memberIds = rows.map((r) => r.id);
    }
    const ownerId = memberIds[0] ?? null;
    const createdBy = quote.respondedBy ?? quote.createdBy;

    // Primeiro status ativo pela ordem (mesma regra de createProjectFromQuote)
    const [firstStatus] = await db
      .select({ id: projectStatuses.id })
      .from(projectStatuses)
      .where(eq(projectStatuses.active, true))
      .orderBy(asc(projectStatuses.position))
      .limit(1);

    const itemsSummary = items.map((item) => `• ${item.description}`).join("\n");
    const description = [
      `Projeto criado a partir do orçamento ${formatQuoteNumber(quote.number)} (${formatCurrency(quote.totalCents)}).`,
      itemsSummary ? `\nItens do orçamento:\n${itemsSummary}` : "",
      quote.description ? `\nPedido do cliente:\n${quote.description}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const [project] = await db
      .insert(projects)
      .values({
        companyId: quote.companyId,
        name: quote.title,
        description,
        statusId: firstStatus?.id ?? null,
        startDate: businessToday(),
        dueDate: quote.desiredDeadline,
        ownerId,
        createdBy,
      })
      .returning({ id: projects.id });

    await db
      .update(quotes)
      .set({ projectId: project.id, updatedAt: new Date() })
      .where(eq(quotes.id, quoteId));

    await logActivity({
      actorId: createdBy,
      companyId: quote.companyId,
      projectId: project.id,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.project_created",
      metadata: {
        number: formatQuoteNumber(quote.number),
        title: quote.title,
        project: quote.title,
      },
    });

    // Modelo de etapas/tarefas do serviço (falha aqui não aborta o restante)
    let milestonesCount = 0;
    let tasksCount = 0;
    if (service?.projectTemplateId) {
      const applied = await materializeProjectTemplate(
        project.id,
        service.projectTemplateId,
        createdBy,
      );
      if (applied.ok) {
        milestonesCount = applied.milestones;
        tasksCount = applied.tasks;
      } else {
        console.error(
          `Modelo ${service.projectTemplateId} não aplicado ao projeto ${project.id}: ${applied.error}`,
        );
      }
    }

    // Equipe do serviço vira membro do projeto
    if (memberIds.length > 0) {
      await db
        .insert(projectMembers)
        .values(memberIds.map((userId) => ({ projectId: project.id, userId })))
        .onConflictDoNothing();
    }

    const team = await teamUsersOfCompany(quote.companyId);

    // Cobrança: vencimento em 3 dias, meio de pagamento escolhido pelo cliente
    let chargeSummary: string;
    if (quote.totalCents > 0) {
      const dueDate = format(
        addDays(parseISO(businessToday()), 3),
        "yyyy-MM-dd",
      );
      const chargeResult = await generateChargeForQuote({
        quote,
        billingType: "undefined",
        dueDate,
        createdBy: null,
      });
      if (chargeResult.ok) {
        chargeSummary = `Cobrança de ${formatCurrency(quote.totalCents)} gerada com vencimento em ${formatDate(dueDate)}.`;
      } else {
        chargeSummary = `A cobrança não pôde ser gerada automaticamente (${chargeResult.error}).`;
        await notifyUsers(team, {
          type: "quote.approved",
          title: `Gere a cobrança do orçamento ${formatQuoteNumber(quote.number)} manualmente`,
          body: `O orçamento "${quote.title}" foi aprovado e o projeto foi criado, mas a cobrança automática falhou: ${chargeResult.error} Gere a cobrança manualmente.`,
          href: `/admin/orcamentos/${quoteId}`,
        });
      }
    } else {
      chargeSummary = "O orçamento não tem valor — nenhuma cobrança foi gerada.";
      await notifyUsers(team, {
        type: "quote.approved",
        title: `Orçamento ${formatQuoteNumber(quote.number)} aprovado sem valor`,
        body: `O orçamento "${quote.title}" foi aprovado com valor zerado. Se houver algo a cobrar, gere a cobrança manualmente.`,
        href: `/admin/orcamentos/${quoteId}`,
      });
    }

    // Clientes da empresa: projeto iniciado
    const clients = await clientUsersOfCompany(quote.companyId);
    await notifyUsers(clients, {
      type: "project.created",
      title: `Projeto "${quote.title}" criado`,
      body: `O orçamento ${formatQuoteNumber(quote.number)} foi aprovado e o projeto "${quote.title}" já foi iniciado. Acompanhe o andamento pelo portal.`,
      href: `/portal/projetos/${project.id}`,
    });

    // Equipe: resumo do que foi automatizado
    await notifyUsers(team, {
      type: "quote.approved",
      title: `Orçamento ${formatQuoteNumber(quote.number)} aprovado — projeto criado automaticamente`,
      body: [
        `O projeto "${quote.title}" foi criado com ${milestonesCount} etapas e ${tasksCount} tarefas.`,
        memberIds.length > 0
          ? `A equipe do serviço foi adicionada ao projeto (${memberIds.length} membros).`
          : "Nenhum membro de equipe vinculado ao serviço foi adicionado ao projeto.",
        chargeSummary,
      ].join(" "),
      href: `/admin/orcamentos/${quoteId}`,
    });

    revalidatePath("/portal/projetos");
    revalidatePath("/portal/orcamentos");
    revalidatePath("/portal/dashboard");
    revalidatePath(`/admin/orcamentos/${quoteId}`);
    revalidatePath("/admin/projetos");
    revalidatePath(`/admin/clientes/${quote.companyId}`);
  } catch (error) {
    console.error(`Automação do orçamento ${quoteId} falhou:`, error);
    try {
      const [quote] = await db
        .select({
          companyId: quotes.companyId,
          number: quotes.number,
          title: quotes.title,
        })
        .from(quotes)
        .where(eq(quotes.id, quoteId))
        .limit(1);
      if (quote) {
        const team = await teamUsersOfCompany(quote.companyId);
        await notifyUsers(team, {
          type: "quote.approved",
          title: `Automação do orçamento ${formatQuoteNumber(quote.number)} falhou`,
          body: `O orçamento "${quote.title}" foi aprovado, mas a automação falhou. Crie o projeto e a cobrança manualmente.`,
          href: `/admin/orcamentos/${quoteId}`,
        });
      }
    } catch (notifyError) {
      console.error(
        "Falha ao avisar a equipe sobre o erro na automação:",
        notifyError,
      );
    }
  }
}
