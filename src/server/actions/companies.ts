"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  assertCompanyAccess,
  requireSuperAdmin,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { adminCompanyAssignments, companies } from "@/lib/db/schema";
import { companyFormSchema } from "@/lib/validations/company";
import {
  actionError,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

export async function createCompany(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    const data = companyFormSchema.parse(input);

    const [created] = await db
      .insert(companies)
      .values({
        razaoSocial: data.razaoSocial,
        nomeFantasia: nullIfEmpty(data.nomeFantasia),
        personType: data.personType,
        cnpj: nullIfEmpty(data.cnpj),
        inscricaoEstadual: nullIfEmpty(data.inscricaoEstadual),
        logradouro: nullIfEmpty(data.logradouro),
        numero: nullIfEmpty(data.numero),
        complemento: nullIfEmpty(data.complemento),
        bairro: nullIfEmpty(data.bairro),
        cidade: nullIfEmpty(data.cidade),
        estado: nullIfEmpty(data.estado),
        cep: nullIfEmpty(data.cep),
        pais: data.pais,
        telefone: nullIfEmpty(data.telefone),
        whatsapp: nullIfEmpty(data.whatsapp),
        site: nullIfEmpty(data.site),
        email: nullIfEmpty(data.email),
        status: data.status,
        observacoes: nullIfEmpty(data.observacoes),
      })
      .returning({ id: companies.id });

    // Admin (não super) passa a enxergar automaticamente a empresa que criou
    if (user.role === "admin") {
      await db.insert(adminCompanyAssignments).values({
        adminId: user.id,
        companyId: created.id,
      });
    }

    revalidatePath("/admin/clientes");
    return { success: true, id: created.id };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe uma empresa cadastrada com este CNPJ.",
    });
  }
}

export async function updateCompany(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireTeam(user);
    await assertCompanyAccess(user, id);
    const data = companyFormSchema.parse(input);

    await db
      .update(companies)
      .set({
        razaoSocial: data.razaoSocial,
        nomeFantasia: nullIfEmpty(data.nomeFantasia),
        personType: data.personType,
        cnpj: nullIfEmpty(data.cnpj),
        inscricaoEstadual: nullIfEmpty(data.inscricaoEstadual),
        logradouro: nullIfEmpty(data.logradouro),
        numero: nullIfEmpty(data.numero),
        complemento: nullIfEmpty(data.complemento),
        bairro: nullIfEmpty(data.bairro),
        cidade: nullIfEmpty(data.cidade),
        estado: nullIfEmpty(data.estado),
        cep: nullIfEmpty(data.cep),
        pais: data.pais,
        telefone: nullIfEmpty(data.telefone),
        whatsapp: nullIfEmpty(data.whatsapp),
        site: nullIfEmpty(data.site),
        email: nullIfEmpty(data.email),
        status: data.status,
        observacoes: nullIfEmpty(data.observacoes),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, id));

    revalidatePath("/admin/clientes");
    revalidatePath(`/admin/clientes/${id}`);
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe uma empresa cadastrada com este CNPJ.",
    });
  }
}

export async function deleteCompany(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);

    await db.delete(companies).where(eq(companies.id, id));

    revalidatePath("/admin/clientes");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
