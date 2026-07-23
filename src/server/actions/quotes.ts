"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  assertCompanyAccess,
  ForbiddenError,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import {
  attachments,
  projects,
  projectStatuses,
  quoteItems,
  quotes,
  services,
} from "@/lib/db/schema";
import {
  clientUsersOfCompany,
  notifyUsers,
  teamUsersOfCompany,
} from "@/lib/notifications";
import { automateApprovedQuote } from "@/lib/quotes/automation";
import {
  formatCurrency,
  formatDate,
  formatQuoteNumber,
} from "@/lib/utils/format";
import {
  quotePayloadSchema,
  quoteRequestSchema,
  quoteStatusLabels,
  quoteTotalCents,
  respondQuotePublicSchema,
  respondQuoteSchema,
  type QuotePayload,
} from "@/lib/validations/quote";
import { actionError, type ActionResult } from "@/server/actions/utils";

function revalidateQuote(id: string, companyId: string) {
  revalidatePath("/admin/orcamentos");
  revalidatePath(`/admin/orcamentos/${id}`);
  revalidatePath("/portal/orcamentos");
  revalidatePath(`/portal/orcamentos/${id}`);
  revalidatePath(`/admin/clientes/${companyId}`);
}

/** Soma dos itens em centavos, resolvendo e validando o desconto. */
function computeTotals(
  data: QuotePayload,
): { discountCents: number; totalCents: number } | { error: string } {
  const subtotal = data.items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
    0,
  );
  // Percentual é resolvido no servidor contra o subtotal real
  const discountCents =
    data.discountType === "percent"
      ? Math.round((subtotal * data.discountPercentBps) / 10000)
      : data.discountCents;
  if (discountCents > subtotal) {
    return { error: "O desconto não pode ser maior que o subtotal." };
  }
  return {
    discountCents,
    totalCents: quoteTotalCents(data.items, discountCents),
  };
}

export async function createQuote(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = quotePayloadSchema.parse(input);
    await assertCompanyAccess(user, data.companyId);

    const totals = computeTotals(data);
    if ("error" in totals) return totals;

    const [quote] = await db
      .insert(quotes)
      .values({
        companyId: data.companyId,
        title: data.title,
        notes: data.notes || null,
        validUntil: data.validUntil || null,
        discountCents: totals.discountCents,
        discountType: data.discountType,
        discountPercentBps: data.discountPercentBps,
        totalCents: totals.totalCents,
        createdBy: user.id,
      })
      .returning({ id: quotes.id, number: quotes.number });

    await db.insert(quoteItems).values(
      data.items.map((item, index) => ({
        quoteId: quote.id,
        serviceId: item.serviceId || null,
        description: item.description,
        quantity: String(item.quantity),
        unitPriceCents: item.unitPriceCents,
        totalCents: Math.round(item.quantity * item.unitPriceCents),
        position: index,
      })),
    );

    await logActivity({
      actorId: user.id,
      companyId: data.companyId,
      entityType: "quote",
      entityId: quote.id,
      action: "quote.created",
      metadata: {
        number: formatQuoteNumber(quote.number),
        title: data.title,
        total: formatCurrency(totals.totalCents),
      },
    });

    revalidatePath("/admin/orcamentos");
    return { success: true, id: quote.id };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Pedido de orçamento feito pelo cliente no portal: cria o quote como
 * "requested" (sem itens — a equipe monta os valores depois) + anexos.
 */
export async function createQuoteRequest(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (user.role !== "client" || !user.companyId) throw new ForbiddenError();
    const companyId = user.companyId;
    const data = quoteRequestSchema.parse(input);

    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, data.serviceId))
      .limit(1);
    if (!service || !service.active || !service.quoteRequestEnabled) {
      return { error: "Serviço indisponível para solicitação." };
    }

    const created = await db.transaction(async (tx) => {
      const [quote] = await tx
        .insert(quotes)
        .values({
          companyId,
          title: data.title,
          status: "requested",
          serviceId: data.serviceId,
          desiredDeadline: data.desiredDeadline,
          description: data.description,
          createdBy: user.id,
        })
        .returning({ id: quotes.id, number: quotes.number });

      if (data.attachments && data.attachments.length > 0) {
        await tx.insert(attachments).values(
          data.attachments.map((file) => ({
            quoteId: quote.id,
            uploadedBy: user.id,
            fileName: file.fileName,
            fileKey: file.fileKey,
            fileSize: file.fileSize,
            mimeType: file.mimeType || null,
          })),
        );
      }

      return quote;
    });

    await logActivity({
      actorId: user.id,
      companyId,
      entityType: "quote",
      entityId: created.id,
      action: "quote.created",
      metadata: {
        number: formatQuoteNumber(created.number),
        title: data.title,
        origem: "portal",
      },
    });

    // Novo pedido do cliente → avisa a equipe da empresa
    const recipients = await teamUsersOfCompany(companyId);
    await notifyUsers(recipients, {
      type: "quote.requested",
      title: `Novo pedido de orçamento ${formatQuoteNumber(created.number)}`,
      body: `Serviço: ${service.name}. Prazo desejado: ${formatDate(data.desiredDeadline)}. Pedido: "${data.title}".`,
      href: `/admin/orcamentos/${created.id}`,
    });

    revalidatePath("/portal/orcamentos");
    revalidatePath("/portal/dashboard");
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateQuote(
  quoteId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = quotePayloadSchema.parse(input);

    const [quote] = await db
      .select({ status: quotes.status, companyId: quotes.companyId })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Orçamento não encontrado." };
    await assertCompanyAccess(user, quote.companyId);
    if (quote.companyId !== data.companyId) {
      await assertCompanyAccess(user, data.companyId);
    }
    if (quote.status !== "draft" && quote.status !== "requested") {
      return {
        error: "Só é possível editar orçamentos em rascunho ou solicitados.",
      };
    }

    const totals = computeTotals(data);
    if ("error" in totals) return totals;

    await db
      .update(quotes)
      .set({
        companyId: data.companyId,
        title: data.title,
        notes: data.notes || null,
        validUntil: data.validUntil || null,
        discountCents: totals.discountCents,
        discountType: data.discountType,
        discountPercentBps: data.discountPercentBps,
        totalCents: totals.totalCents,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId));

    // Substitui os itens pelos do formulário
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    await db.insert(quoteItems).values(
      data.items.map((item, index) => ({
        quoteId,
        serviceId: item.serviceId || null,
        description: item.description,
        quantity: String(item.quantity),
        unitPriceCents: item.unitPriceCents,
        totalCents: Math.round(item.quantity * item.unitPriceCents),
        position: index,
      })),
    );

    revalidateQuote(quoteId, data.companyId);
    return { success: true, id: quoteId };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteQuote(quoteId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Orçamento não encontrado." };
    await assertCompanyAccess(user, quote.companyId);
    // Super admin exclui em qualquer status; demais membros só rascunho/solicitados
    if (
      quote.status !== "draft" &&
      quote.status !== "requested" &&
      user.role !== "super_admin"
    ) {
      return {
        error: "Só é possível excluir orçamentos em rascunho ou solicitados.",
      };
    }

    await db.transaction(async (tx) => {
      // Versões duplicadas deste orçamento: desvincula (FK sem cascade).
      // Cobranças geradas são desvinculadas pelo banco (set null);
      // itens são removidos em cascade.
      await tx
        .update(quotes)
        .set({ duplicatedFromId: null })
        .where(eq(quotes.duplicatedFromId, quoteId));
      await tx.delete(quotes).where(eq(quotes.id, quoteId));
    });

    await logActivity({
      actorId: user.id,
      companyId: quote.companyId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.deleted",
      metadata: {
        number: formatQuoteNumber(quote.number),
        title: quote.title,
      },
    });

    revalidateQuote(quoteId, quote.companyId);
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Envia o orçamento ao cliente: draft|requested → sent + notificação/e-mail. */
export async function sendQuote(quoteId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Orçamento não encontrado." };
    await assertCompanyAccess(user, quote.companyId);
    if (quote.status !== "draft" && quote.status !== "requested") {
      return { error: "Este orçamento já foi enviado ao cliente." };
    }

    await db
      .update(quotes)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(quotes.id, quoteId));

    await logActivity({
      actorId: user.id,
      companyId: quote.companyId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.sent",
      metadata: {
        number: formatQuoteNumber(quote.number),
        title: quote.title,
      },
    });

    // Clientes da empresa: notificação interna + e-mail com os dados do orçamento
    const recipients = await clientUsersOfCompany(quote.companyId);
    await notifyUsers(recipients, {
      type: "quote.sent",
      title: `Novo orçamento disponível: ${formatQuoteNumber(quote.number)}`,
      body: `O orçamento "${quote.title}" foi enviado para análise de vocês. Acesse o portal para visualizar os detalhes e aprovar ou recusar.`,
      href: `/portal/orcamentos/${quoteId}`,
      rows: [
        { label: "Orçamento", value: formatQuoteNumber(quote.number) },
        { label: "Título", value: quote.title },
        { label: "Validade", value: formatDate(quote.validUntil) },
        { label: "Valor total", value: formatCurrency(quote.totalCents) },
      ],
    });

    revalidateQuote(quoteId, quote.companyId);
    return { success: true, id: quoteId };
  } catch (error) {
    return actionError(error);
  }
}

/** Resposta do cliente no portal: aprovar ou recusar (só quando "sent"). */
export async function respondQuote(
  quoteId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const data = respondQuoteSchema.parse(input);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Orçamento não encontrado." };
    if (user.role !== "client" || user.companyId !== quote.companyId) {
      return { error: "Você não tem permissão para esta ação." };
    }
    if (quote.status !== "sent") {
      return { error: "Este orçamento já foi respondido." };
    }

    await db
      .update(quotes)
      .set({
        status: data.action,
        respondedAt: new Date(),
        respondedBy: user.id,
        responseNote: data.note || null,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quoteId));

    await logActivity({
      actorId: user.id,
      companyId: quote.companyId,
      entityType: "quote",
      entityId: quoteId,
      action: `quote.${data.action}`,
      metadata: {
        number: formatQuoteNumber(quote.number),
        title: quote.title,
        note: data.note || null,
      },
    });

    // Equipe responsável pela empresa: aprovação/recusa em tempo real
    const recipients = await teamUsersOfCompany(quote.companyId);
    await notifyUsers(recipients, {
      type: `quote.${data.action}`,
      title: `Orçamento ${formatQuoteNumber(quote.number)} ${quoteStatusLabels[data.action].toLowerCase()}`,
      body: `O cliente ${data.action === "approved" ? "aprovou" : "recusou"} o orçamento "${quote.title}" no valor de ${formatCurrency(quote.totalCents)}.${data.note ? ` Comentário: "${data.note}"` : ""}`,
      href: `/admin/orcamentos/${quoteId}`,
    });

    revalidateQuote(quoteId, quote.companyId);

    // Aprovação dispara a automação (projeto + cobrança). Best-effort:
    // a resposta do cliente nunca falha por causa dela.
    if (data.action === "approved") {
      try {
        await automateApprovedQuote(quoteId);
      } catch (automationError) {
        console.error(`Automação do orçamento ${quoteId} falhou:`, automationError);
      }
    }

    return { success: true, id: quoteId };
  } catch (error) {
    return actionError(error);
  }
}

/** Cria um projeto a partir de um orçamento aprovado. */
export async function createProjectFromQuote(
  quoteId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Orçamento não encontrado." };
    await assertCompanyAccess(user, quote.companyId);
    if (quote.status !== "approved") {
      return { error: "Só é possível criar projeto de orçamento aprovado." };
    }
    if (quote.projectId) {
      return { error: "Este orçamento já gerou um projeto." };
    }

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId))
      .orderBy(asc(quoteItems.position));

    // Primeiro status ativo pela ordem (mesma regra de createTask)
    const [firstStatus] = await db
      .select({ id: projectStatuses.id })
      .from(projectStatuses)
      .where(eq(projectStatuses.active, true))
      .orderBy(asc(projectStatuses.position))
      .limit(1);

    const itemsSummary = items
      .map((item) => `• ${item.description}`)
      .join("\n");
    const description = [
      `Projeto criado a partir do orçamento ${formatQuoteNumber(quote.number)} (${formatCurrency(quote.totalCents)}).`,
      itemsSummary ? `\nItens do orçamento:\n${itemsSummary}` : "",
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
        ownerId: user.id,
        createdBy: user.id,
      })
      .returning({ id: projects.id });

    await db
      .update(quotes)
      .set({ projectId: project.id, updatedAt: new Date() })
      .where(eq(quotes.id, quoteId));

    await logActivity({
      actorId: user.id,
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

    revalidateQuote(quoteId, quote.companyId);
    revalidatePath("/admin/projetos");
    return { success: true, id: project.id };
  } catch (error) {
    return actionError(error);
  }
}

/** Duplica o orçamento como novo rascunho (versão incrementada). */
export async function duplicateQuote(quoteId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);
    if (!quote) return { error: "Orçamento não encontrado." };
    await assertCompanyAccess(user, quote.companyId);

    const items = await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId))
      .orderBy(asc(quoteItems.position));

    const [copy] = await db
      .insert(quotes)
      .values({
        companyId: quote.companyId,
        title: quote.title,
        notes: quote.notes,
        validUntil: quote.validUntil,
        discountCents: quote.discountCents,
        discountType: quote.discountType,
        discountPercentBps: quote.discountPercentBps,
        totalCents: quote.totalCents,
        createdBy: user.id,
        version: quote.version + 1,
        duplicatedFromId: quote.id,
      })
      .returning({ id: quotes.id, number: quotes.number });

    if (items.length > 0) {
      await db.insert(quoteItems).values(
        items.map((item) => ({
          quoteId: copy.id,
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
          position: item.position,
        })),
      );
    }

    await logActivity({
      actorId: user.id,
      companyId: quote.companyId,
      entityType: "quote",
      entityId: copy.id,
      action: "quote.duplicated",
      metadata: {
        number: formatQuoteNumber(copy.number),
        title: quote.title,
        from: formatQuoteNumber(quote.number),
        version: quote.version + 1,
      },
    });

    revalidatePath("/admin/orcamentos");
    return { success: true, id: copy.id };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Resposta via link público (sem login): identifica o orçamento pelo token
 * e registra o nome informado por quem respondeu.
 */
export async function respondQuotePublic(
  token: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    if (!z.uuid().safeParse(token).success) {
      return { error: "Orçamento não encontrado." };
    }
    const data = respondQuotePublicSchema.parse(input);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.publicToken, token))
      .limit(1);
    if (!quote || quote.status === "draft") {
      return { error: "Orçamento não encontrado." };
    }
    if (quote.status !== "sent") {
      return { error: "Este orçamento já foi respondido." };
    }

    await db
      .update(quotes)
      .set({
        status: data.action,
        respondedAt: new Date(),
        respondedBy: null,
        respondedName: data.name,
        responseNote: data.note || null,
        updatedAt: new Date(),
      })
      .where(eq(quotes.id, quote.id));

    await logActivity({
      actorId: null,
      companyId: quote.companyId,
      entityType: "quote",
      entityId: quote.id,
      action: `quote.${data.action}`,
      metadata: {
        number: formatQuoteNumber(quote.number),
        title: quote.title,
        via: "link_publico",
        name: data.name,
        note: data.note || null,
      },
    });

    const recipients = await teamUsersOfCompany(quote.companyId);
    await notifyUsers(recipients, {
      type: `quote.${data.action}`,
      title: `Orçamento ${formatQuoteNumber(quote.number)} ${quoteStatusLabels[data.action].toLowerCase()}`,
      body: `${data.name} ${data.action === "approved" ? "aprovou" : "recusou"} o orçamento "${quote.title}" no valor de ${formatCurrency(quote.totalCents)} (via link público).${data.note ? ` Comentário: "${data.note}"` : ""}`,
      href: `/admin/orcamentos/${quote.id}`,
    });

    revalidateQuote(quote.id, quote.companyId);

    // Aprovação dispara a automação (projeto + cobrança). Best-effort:
    // a resposta via link público nunca falha por causa dela.
    if (data.action === "approved") {
      try {
        await automateApprovedQuote(quote.id);
      } catch (automationError) {
        console.error(`Automação do orçamento ${quote.id} falhou:`, automationError);
      }
    }

    return { success: true, id: quote.id };
  } catch (error) {
    return actionError(error);
  }
}
