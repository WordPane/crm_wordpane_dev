import { desc, eq, sql } from "drizzle-orm";

import { requireSuperAdmin, type SessionUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import {
  clientRegistrations,
  users,
  type ClientRegistration,
} from "@/lib/db/schema";

/** Cadastro sem o hash de senha (nunca vai para o cliente). */
export type RegistrationListItem = Omit<
  ClientRegistration,
  "userPasswordHash"
> & {
  reviewerName: string | null;
};

/** Lista cadastros (triagem), com filtro opcional por status. */
export async function listRegistrations(
  user: SessionUser,
  status?: ClientRegistration["status"],
): Promise<RegistrationListItem[]> {
  requireSuperAdmin(user);

  return db
    .select({
      id: clientRegistrations.id,
      razaoSocial: clientRegistrations.razaoSocial,
      nomeFantasia: clientRegistrations.nomeFantasia,
      personType: clientRegistrations.personType,
      cnpj: clientRegistrations.cnpj,
      telefone: clientRegistrations.telefone,
      whatsapp: clientRegistrations.whatsapp,
      email: clientRegistrations.email,
      site: clientRegistrations.site,
      logradouro: clientRegistrations.logradouro,
      numero: clientRegistrations.numero,
      complemento: clientRegistrations.complemento,
      bairro: clientRegistrations.bairro,
      cidade: clientRegistrations.cidade,
      estado: clientRegistrations.estado,
      cep: clientRegistrations.cep,
      mensagem: clientRegistrations.mensagem,
      userName: clientRegistrations.userName,
      userEmail: clientRegistrations.userEmail,
      userPhone: clientRegistrations.userPhone,
      userPosition: clientRegistrations.userPosition,
      status: clientRegistrations.status,
      reviewNote: clientRegistrations.reviewNote,
      reviewedBy: clientRegistrations.reviewedBy,
      reviewedAt: clientRegistrations.reviewedAt,
      approvedCompanyId: clientRegistrations.approvedCompanyId,
      approvedUserId: clientRegistrations.approvedUserId,
      createdAt: clientRegistrations.createdAt,
      updatedAt: clientRegistrations.updatedAt,
      reviewerName: users.name,
    })
    .from(clientRegistrations)
    .leftJoin(users, eq(clientRegistrations.reviewedBy, users.id))
    .where(status ? eq(clientRegistrations.status, status) : undefined)
    .orderBy(desc(clientRegistrations.createdAt));
}

/** Quantidade de cadastros pendentes (badge da página). */
export async function countPendingRegistrations(
  user: SessionUser,
): Promise<number> {
  requireSuperAdmin(user);

  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(clientRegistrations)
    .where(eq(clientRegistrations.status, "pendente"));
  return row?.value ?? 0;
}
