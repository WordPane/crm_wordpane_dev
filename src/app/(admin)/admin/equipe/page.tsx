import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TeamManager } from "@/components/team/team-manager";
import { requireUser } from "@/lib/access/permissions";
import {
  listAllAssignments,
  listAllCompaniesForSelect,
  listTeamUsers,
} from "@/lib/queries/team";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect("/admin/dashboard");

  const [members, companies, assignments] = await Promise.all([
    listTeamUsers(user),
    listAllCompaniesForSelect(),
    listAllAssignments(user),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie os membros da equipe interna e as empresas atribuídas a cada
          admin.
        </p>
      </div>

      <TeamManager
        members={members}
        companies={companies}
        assignments={assignments}
      />
    </div>
  );
}
