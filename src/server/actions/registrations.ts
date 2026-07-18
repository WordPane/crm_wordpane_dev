"use server";

import { hashSync } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireTeam, requireUser } from "@/lib/access/permissions";
import { logActivity } from "@/lib/activities";
import { db } from "@/lib/db";
import { clientRegistrations, companies, users } from "@/lib/db/schema";
import { notifyUsers } from "@/lib/notifications";
import {
  registrationFormSchema,
  rejectRegistrationSchema,
} from "@/lib/validations/registration";
import {
  actionError,
  normalizeEmail,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

/** Extrai o honeypot de um payload desconhecido (antes de qualquer validação). */
function honeypotValue(input: unknown): string {
  if (typeof input !== "object" || input === null || !("empresa" in input)) {
    return "";
  }
  const value = (input as { empresa?: unknown }).empresa;
  return typeof value === "string" ? value : "";
}

/**
 * Cadastro público de empresa (SEM autenticação).
 * Nunca revela se o e-mail já existe: duplicados retornam sucesso falso.
 */
export async function submitRegistration(input: unknown): Promise<ActionResult> {
  // Honeypot preenchido → bot: finge sucesso sem gravar nada
  if (honeypotValue(input).trim()) return { success: true };

  const parsed = registrationFormSchema.safeParse(input);
  if (!parsed.success) return { error: "Revise os campos do formulário." };
  const data = parsed.data;

  try {
    const userEmail = normalizeEmail(data.userEmail);

    // E-mail já é usuário OU já tem cadastro pendente → sucesso falso (não vaza informação)
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1);
    if (existingUser) return { success: true };

    const [existingPending] = await db
      .select({ id: clientRegistrations.id })
      .from(clientRegistrations)
      .where(
        and(
          eq(clientRegistrations.userEmail, userEmail),
          eq(clientRegistrations.status, "pendente"),
        ),
      )
      .limit(1);
    if (existingPending) return { success: true };

    await db.insert(clientRegistrations).values({
      razaoSocial: data.razaoSocial,
      nomeFantasia: nullIfEmpty(data.nomeFantasia),
      cnpj: nullIfEmpty(data.cnpj),
      telefone: nullIfEmpty(data.telefone),
      whatsapp: nullIfEmpty(data.whatsapp),
      email: nullIfEmpty(data.email),
      site: nullIfEmpty(data.site),
      cidade: nullIfEmpty(data.cidade),
      estado: nullIfEmpty(data.estado),
      mensagem: nullIfEmpty(data.mensagem),
      userName: data.userName,
      userEmail,
      userPasswordHash: hashSync(data.userPassword, 10),
      userPhone: nullIfEmpty(data.userPhone),
      userPosition: nullIfEmpty(data.userPosition),
    });

    // Avisa os super admins ativos (busca direta — action pública, sem sessão)
    const superAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "super_admin"), eq(users.status, "active")));
    await notifyUsers(
      superAdmins.map((row) => row.id),
      {
        type: "registration.created",
        title: `Novo cadastro: ${data.nomeFantasia?.trim() || data.razaoSocial}`,
        body: `Responsável: ${data.userName} (${userEmail}).`,
        href: "/admin/cadastros",
      },
    );

    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Não foi possível enviar seu cadastro. Tente novamente." };
  }
}

/**
 * Aprova o cadastro: cria a empresa (ativa) e o 1º usuário (admin dela),
 * com o hash de senha gravado no registro. Qualquer membro da equipe aprova.
 */
export async function approveRegistration(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);

    const [registration] = await db
      .select()
      .from(clientRegistrations)
      .where(eq(clientRegistrations.id, id))
      .limit(1);
    if (!registration) return { error: "Cadastro não encontrado." };
    if (registration.status !== "pendente") {
      return { error: "Este cadastro já foi triado." };
    }

    const userEmail = normalizeEmail(registration.userEmail);

    type ApprovalTxResult = { error: string } | { companyId: string };

    const result: ApprovalTxResult = await db.transaction(async (tx) => {
      // O e-mail precisa continuar único em users no momento da aprovação
      const [conflict] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, userEmail))
        .limit(1);
      if (conflict) {
        return {
          error: "Já existe um usuário com este e-mail — edite ou recuse.",
        };
      }

      const [company] = await tx
        .insert(companies)
        .values({
          razaoSocial: registration.razaoSocial,
          nomeFantasia: registration.nomeFantasia,
          cnpj: registration.cnpj,
          telefone: registration.telefone,
          whatsapp: registration.whatsapp,
          email: registration.email,
          site: registration.site,
          cidade: registration.cidade,
          estado: registration.estado,
          pais: "Brasil",
          status: "ativo",
        })
        .returning({ id: companies.id });

      const [createdUser] = await tx
        .insert(users)
        .values({
          name: registration.userName,
          email: userEmail,
          passwordHash: registration.userPasswordHash,
          phone: registration.userPhone,
          position: registration.userPosition,
          role: "client",
          status: "active",
          isCompanyAdmin: true,
          companyId: company.id,
        })
        .returning({ id: users.id });

      await tx
        .update(clientRegistrations)
        .set({
          status: "aprovado",
          reviewedBy: user.id,
          reviewedAt: new Date(),
          approvedCompanyId: company.id,
          approvedUserId: createdUser.id,
          updatedAt: new Date(),
        })
        .where(eq(clientRegistrations.id, id));

      return { companyId: company.id };
    });

    if ("error" in result) return result;

    await logActivity({
      actorId: user.id,
      companyId: result.companyId,
      entityType: "company",
      entityId: result.companyId,
      action: "company.created",
      metadata: { origin: "cadastro_publico" },
    });

    revalidatePath("/admin/cadastros");
    revalidatePath("/admin/clientes");
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe uma empresa ou usuário com estes dados.",
    });
  }
}

/** Recusa o cadastro com justificativa interna obrigatória. */
export async function rejectRegistration(
  id: string,
  note: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = rejectRegistrationSchema.parse({ note });

    const [registration] = await db
      .select({ id: clientRegistrations.id, status: clientRegistrations.status })
      .from(clientRegistrations)
      .where(eq(clientRegistrations.id, id))
      .limit(1);
    if (!registration) return { error: "Cadastro não encontrado." };
    if (registration.status !== "pendente") {
      return { error: "Este cadastro já foi triado." };
    }

    await db
      .update(clientRegistrations)
      .set({
        status: "recusado",
        reviewNote: data.note,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientRegistrations.id, id));

    revalidatePath("/admin/cadastros");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
