import type { Metadata } from "next";
import { ArrowLeft, Building2, Calendar } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { PriorityChip } from "@/components/chips";
import { ProjectLinksSection } from "@/components/links/project-links-section";
import { MilestonesSection } from "@/components/projects/milestones-section";
import { ProjectDeleteButton } from "@/components/projects/project-delete-button";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectMembersSection } from "@/components/projects/project-members-section";
import { ProjectStatusMenu } from "@/components/projects/project-status-menu";
import { ProjectTasksSection } from "@/components/projects/project-tasks-section";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectTabsPersist } from "@/components/projects/project-tabs-persist";
import {
  ForbiddenError,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { listProjectActivities } from "@/lib/queries/activities";
import {
  listProjectAttachments,
  listProjectTaskAttachments,
} from "@/lib/queries/attachments";
import { listCompanies } from "@/lib/queries/companies";
import { listProjectLinks } from "@/lib/queries/links";
import { getProject, listActiveProjectStatuses } from "@/lib/queries/projects";
import { listActiveTaskStatuses } from "@/lib/queries/tasks";
import { listTeamSelectOptions } from "@/lib/queries/team";
import { listProjectTemplateOptions } from "@/lib/queries/templates";
import { formatDate } from "@/lib/utils/format";
import { projectToFormValues, projectTypeLabels } from "@/lib/validations/project";

export const metadata: Metadata = { title: "Detalhes do projeto" };

const TABS = [
  "visao",
  "etapas",
  "tarefas",
  "timeline",
  "arquivos",
  "links",
] as const;
type TabValue = (typeof TABS)[number];

function isTab(value: string | undefined): value is TabValue {
  return TABS.includes(value as TabValue);
}

export default async function ProjectDetailPage({
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
  const hasExplicitTab = isTab(tabValue);
  const activeTab: TabValue = hasExplicitTab ? tabValue : "visao";

  let detail;
  try {
    detail = await getProject(user, id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!detail) notFound();

  const { project, company, status, owner, members, milestones, tasks } = detail;

  const [
    statuses,
    taskStatuses,
    teamUsers,
    companies,
    projectActivities,
    projectAttachments,
    taskAttachments,
    projectLinks,
    templates,
  ] = await Promise.all([
    listActiveProjectStatuses(user),
    listActiveTaskStatuses(user),
    listTeamSelectOptions(user),
    listCompanies(user),
    listProjectActivities(user, project.id),
    listProjectAttachments(user, project.id),
    listProjectTaskAttachments(user, project.id),
    listProjectLinks(user, project.id),
    listProjectTemplateOptions(user),
  ]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status?.isFinal).length;
  const percent =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="space-y-3">
        <Link
          href="/admin/projetos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para projetos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{project.name}</h1>
          <ProjectStatusMenu
            projectId={project.id}
            current={status}
            statuses={statuses}
          />
          <PriorityChip priority={project.priority} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Link
            href={`/admin/clientes/${company.id}`}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Building2 className="size-4" />
            {company.name}
          </Link>
          <span>{projectTypeLabels[project.type]}</span>
          <span>Responsável: {owner?.name ?? "—"}</span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-4" />
            {formatDate(project.startDate)} → {formatDate(project.dueDate)}
          </span>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <ProjectTabsPersist initialTab={activeTab} hasExplicitTab={hasExplicitTab}>
        <TabsList>
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="etapas">Etapas</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-6 pt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Descrição</CardTitle>
              </CardHeader>
              <CardContent>
                {project.description ? (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Sem descrição cadastrada.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Progresso geral</CardTitle>
                <CardDescription>
                  {doneTasks} de {totalTasks} tarefas concluídas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Progress value={percent} className="flex-1" />
                  <span className="text-sm font-medium tabular-nums">
                    {percent}%
                  </span>
                </div>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Início</dt>
                    <dd>{formatDate(project.startDate)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Prazo</dt>
                    <dd>{formatDate(project.dueDate)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Concluído em</dt>
                    <dd>{formatDate(project.completedAt)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Etapas</dt>
                    <dd>{milestones.length}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Editar projeto</CardTitle>
              <CardDescription>
                Atualize os dados cadastrais do projeto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectForm
                mode="edit"
                projectId={project.id}
                companies={companies.map((c) => ({
                  id: c.id,
                  name: c.nomeFantasia || c.razaoSocial,
                }))}
                statuses={statuses}
                teamUsers={teamUsers}
                defaultValues={projectToFormValues(project)}
              />
              {user.role === "super_admin" && (
                <div className="mt-8 border-t border-border pt-5">
                  <h3 className="text-sm font-semibold text-destructive">
                    Zona de perigo
                  </h3>
                  <p className="mt-1 mb-3 text-xs text-muted-foreground">
                    A exclusão remove etapas, tarefas e checklists em cascade.
                  </p>
                  <ProjectDeleteButton
                    projectId={project.id}
                    projectName={project.name}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <ProjectMembersSection
            projectId={project.id}
            members={members}
            teamUsers={teamUsers}
          />
        </TabsContent>

        <TabsContent value="etapas" className="pt-4">
          <MilestonesSection
            projectId={project.id}
            milestones={milestones}
            teamUsers={teamUsers}
            templates={templates}
          />
        </TabsContent>

        <TabsContent value="tarefas" className="pt-4">
          <ProjectTasksSection
            projectId={project.id}
            milestones={milestones.map((m) => ({ id: m.id, name: m.name }))}
            tasks={tasks}
            statuses={taskStatuses}
            teamUsers={teamUsers}
            currentUserId={user.id}
          />
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Timeline do projeto</CardTitle>
              <CardDescription>
                Atividades registradas no projeto, da mais recente à mais
                antiga.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={projectActivities} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="arquivos" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Arquivos do projeto</CardTitle>
              <CardDescription>
                Documentos e anexos gerais do projeto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentList
                attachments={projectAttachments}
                projectId={project.id}
                currentUserId={user.id}
                currentUserRole={user.role}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anexos das tarefas</CardTitle>
              <CardDescription>
                Arquivos enviados nas tarefas deste projeto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentList
                attachments={taskAttachments}
                currentUserId={user.id}
                currentUserRole={user.role}
                readOnly
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="links" className="pt-4">
          <ProjectLinksSection projectId={project.id} links={projectLinks} />
        </TabsContent>
      </ProjectTabsPersist>
    </div>
  );
}
