import type { Metadata } from "next";
import { ArrowLeft, FolderKanban, Inbox, Pencil, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyStatusChip } from "@/components/chips";
import { CompanyForm } from "@/components/companies/company-form";
import { CompanyUsersSection } from "@/components/companies/company-users-section";
import { DemandList } from "@/components/demands/demand-list";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ForbiddenError,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import {
  getCompany,
  listCompanyAdmins,
  listCompanyUsers,
} from "@/lib/queries/companies";
import { listDemands, listScopedMilestones } from "@/lib/queries/demands";
import { listProjects } from "@/lib/queries/projects";
import { listTeamSelectOptions } from "@/lib/queries/team";
import { companyToFormValues } from "@/lib/validations/company";

export const metadata: Metadata = { title: "Detalhes do cliente" };

const TABS = ["dados", "usuarios", "projetos", "demandas"] as const;
type TabValue = (typeof TABS)[number];

function isTab(value: string | undefined): value is TabValue {
  return TABS.includes(value as TabValue);
}

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { id } = await params;
  const { tab } = await searchParams;
  const tabValue = Array.isArray(tab) ? tab[0] : tab;
  const activeTab: TabValue = isTab(tabValue) ? tabValue : "dados";

  let company;
  try {
    company = await getCompany(user, id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!company) notFound();

  const [companyUsers, admins, companyProjects, companyDemands, milestones, teamUsers] =
    await Promise.all([
      listCompanyUsers(user, id),
      user.role === "super_admin"
        ? listCompanyAdmins(id)
        : Promise.resolve(null),
      listProjects(user, { companyId: id }),
      listDemands(user, { companyId: id }),
      listScopedMilestones(user),
      listTeamSelectOptions(user),
    ]);

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/admin/clientes"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar para clientes
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold">
              {company.nomeFantasia || company.razaoSocial}
            </h1>
            <CompanyStatusChip status={company.status} />
          </div>
          {company.cnpj && (
            <p className="text-sm text-muted-foreground">
              {company.personType === "pf" ? "CPF" : "CNPJ"} {company.cnpj}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          render={<Link href={`/admin/clientes/${id}?tab=dados`} />}
        >
          <Pencil />
          Editar
        </Button>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="projetos">Projetos</TabsTrigger>
          <TabsTrigger value="demandas">Demandas</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados da empresa</CardTitle>
              <CardDescription>
                Informações cadastrais do cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompanyForm
                mode="edit"
                companyId={company.id}
                defaultValues={companyToFormValues(company)}
              />

              {admins && (
                <div className="mt-8 border-t border-border pt-5">
                  <h3 className="text-sm font-semibold">Equipe responsável</h3>
                  {admins.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nenhum admin atribuído a esta empresa.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {admins.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <UserRound className="size-4 text-muted-foreground" />
                          <span className="font-medium">{a.name}</span>
                          <span className="text-muted-foreground">
                            ({a.email})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Gerencie as atribuições em Equipe → Empresas atribuídas.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios" className="pt-4">
          <CompanyUsersSection
            companyId={company.id}
            users={companyUsers}
            canImpersonate={user.role === "super_admin"}
          />
        </TabsContent>

        <TabsContent value="projetos" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Projetos da empresa</CardTitle>
              <CardDescription>
                {companyProjects.length}{" "}
                {companyProjects.length === 1
                  ? "projeto vinculado"
                  : "projetos vinculados"}{" "}
                a esta empresa.
              </CardDescription>
              <CardAction>
                <Button
                  size="sm"
                  render={<Link href={`/admin/projetos/novo?empresa=${id}`} />}
                >
                  <Plus />
                  Novo projeto
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {companyProjects.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <FolderKanban className="size-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium">
                    Nenhum projeto para esta empresa
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Crie o primeiro projeto vinculado a este cliente.
                  </p>
                </div>
              ) : (
                <ProjectsTable items={companyProjects} showCompany={false} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="demandas" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Demandas da empresa</CardTitle>
              <CardDescription>
                {companyDemands.length}{" "}
                {companyDemands.length === 1
                  ? "demanda enviada"
                  : "demandas enviadas"}{" "}
                por este cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {companyDemands.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Inbox className="size-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium">
                    Nenhuma demanda para esta empresa
                  </p>
                  <p className="text-sm text-muted-foreground">
                    As demandas enviadas pelo portal do cliente aparecem aqui.
                  </p>
                </div>
              ) : (
                <DemandList
                  demands={companyDemands}
                  projects={companyProjects.map((p) => ({
                    id: p.id,
                    name: p.name,
                    companyId: p.companyId,
                  }))}
                  milestones={milestones}
                  teamUsers={teamUsers}
                  showCompany={false}
                  canManage={user.role === "super_admin"}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
