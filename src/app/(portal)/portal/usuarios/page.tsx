import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortalUsersSection } from "@/components/portal/portal-users-section";
import { requireUser } from "@/lib/access/permissions";
import { getPortalProfile, listPortalCompanyUsers } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "Usuários" };

export default async function PortalUsersPage() {
  const user = await requireUser();
  if (user.role !== "client" || !user.companyId) redirect("/portal/dashboard");

  // Flag FRESCO do banco — a sessão JWT não carrega isCompanyAdmin
  const profile = await getPortalProfile(user);
  if (!profile?.isCompanyAdmin) redirect("/portal/dashboard");

  const users = await listPortalCompanyUsers(user);

  return <PortalUsersSection users={users} />;
}
