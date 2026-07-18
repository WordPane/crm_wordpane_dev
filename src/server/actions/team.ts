"use server";

import { hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireSuperAdmin, requireUser } from "@/lib/access/permissions";
import { db } from "@/lib/db";
import { adminCompanyAssignments, users } from "@/lib/db/schema";
import {
  adminAssignmentsSchema,
  teamMemberCreateSchema,
  teamMemberUpdateSchema,
} from "@/lib/validations/user";
import {
  actionError,
  normalizeEmail,
  nullIfEmpty,
  type ActionResult,
} from "@/server/actions/utils";

export async function createTeamMember(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = teamMemberCreateSchema.parse(input);

    await db.insert(users).values({
      name: data.name,
      email: normalizeEmail(data.email),
      position: nullIfEmpty(data.position),
      role: data.role,
      status: data.status,
      passwordHash: hashSync(data.password, 10),
      companyId: null,
    });

    revalidatePath("/admin/equipe");
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe um usuário cadastrado com este e-mail.",
    });
  }
}

export async function updateTeamMember(
  memberId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const data = teamMemberUpdateSchema.parse(input);

    const [member] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, memberId))
      .limit(1);
    if (!member || (member.role !== "admin" && member.role !== "super_admin")) {
      return { error: "Membro da equipe não encontrado." };
    }

    // Senha em branco na edição mantém a atual
    const password = data.password?.trim();

    await db
      .update(users)
      .set({
        name: data.name,
        email: normalizeEmail(data.email),
        position: nullIfEmpty(data.position),
        role: data.role,
        status: data.status,
        ...(password ? { passwordHash: hashSync(password, 10) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, memberId));

    revalidatePath("/admin/equipe");
    return { success: true };
  } catch (error) {
    return actionError(error, {
      uniqueMessage: "Já existe um usuário cadastrado com este e-mail.",
    });
  }
}

export async function setAdminAssignments(
  adminId: string,
  companyIds: string[],
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    requireSuperAdmin(user);
    const parsed = adminAssignmentsSchema.parse({ adminId, companyIds });

    const [member] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, parsed.adminId))
      .limit(1);
    if (!member || (member.role !== "admin" && member.role !== "super_admin")) {
      return { error: "Membro da equipe não encontrado." };
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(adminCompanyAssignments)
        .where(eq(adminCompanyAssignments.adminId, parsed.adminId));
      if (parsed.companyIds.length > 0) {
        await tx.insert(adminCompanyAssignments).values(
          parsed.companyIds.map((companyId) => ({
            adminId: parsed.adminId,
            companyId,
          })),
        );
      }
    });

    revalidatePath("/admin/equipe");
    return { success: true };
  } catch (error) {
    return actionError(error);
  }
}
