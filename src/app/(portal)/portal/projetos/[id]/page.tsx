import type { Metadata } from "next";
import { ArrowLeft, Calendar, ExternalLink, Link2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { PriorityChip, StatusColorChip } from "@/components/chips";
import { PortalPlanCard } from "@/components/portal/portal-plan-card";
import { PortalProjectComments } from "@/components/portal/portal-project-comments";
import { PortalProjectMilestonesSection } from "@/components/portal/portal-project-milestones-section";
import { PortalProjectTasksSection } from "@/components/portal/portal-project-tasks-section";
import { ProjectTabsPersist } from "@/components/projects/project-tabs-persist";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import type { Task } from "@/lib/db/schema";
import {
  listMentionableTasks,
  listMentionableUsers,
  listProjectComments,
} from "@/lib/queries/comments";
import {
  computeProjectPlanBalance,
  listActiveMaintenancePackages,
} from "@/lib/queries/maintenance";
import { getPortalProject } from "@/lib/queries/portal";
import type { StatusInfo } from "@/lib/queries/projects";
import { formatDate, initials, timeAgo } from "@/lib/utils/format";
import { projectTypeLabels } from "@/lib/validations/project";
import {
  createPortalAttachment,
  deletePortalAttachment,
} from "@/server/actions/portal";

export const metadata: Metadata = { title: "Projeto" };

const TABS = [
  "visao",
  "etapas",
  "tarefas",
  "timeline",
  "arquivos",
  "links",
  "conversa",
] as const;
type TabValue = (typeof TABS)[number];

function isTab(value: string | undefined): value is TabValue {
  return TABS.includes(value as TabValue);
}

type PortalTask = Task & { status: StatusInfo | null };

export default async function PortalProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  const tabValue = Array.isArray(tab) ? tab[0] : tab;
  const hasExplicitTab = isTab(tabValue);
  const activeTab: TabValue = hasExplicitTab ? tabValue : "visao";

  let detail;
  try {
    detail = await getPortalProject(user, id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!detail) notFound();

  const { project, status, owner, milestones, tasks, links, activities } = detail;

  // Saldo do plano de manutenção (se houver) — o acesso ao projeto já foi
  // validado acima por getPortalProject
  const [planBalance, maintenancePackages, projectComments, mentionableUsers, mentionableTasks] =
    await Promise.all([
      computeProjectPlanBalance(project.id),
      listActiveMaintenancePackages(),
      listProjectComments(user, project.id),
      listMentionableUsers(project.id, project.companyId),
      listMentionableTasks(project.id),
    ]);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status?.isFinal).length;
  const percent =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const tasksByMilestone = new Map<string | null, PortalTask[]>();
  for (const task of tasks as PortalTask[]) {
    const list = tasksByMilestone.get(task.milestoneId) ?? [];
    list.push(task);
    tasksByMilestone.set(task.milestoneId, list);
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="space-y-3">
        <Link
          href="/portal/projetos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para projetos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold break-words">{project.name}</h1>
          {status && <StatusColorChip name={status.name} color={status.color} />}
          <PriorityChip priority={project.priority} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{projectTypeLabels[project.type]}</span>
          {owner && (
            <span className="inline-flex items-center gap-2">
              <Avatar className="size-6">
                {owner.avatarUrl && (
                  <AvatarImage src={owner.avatarUrl} alt={owner.name} />
                )}
                <AvatarFallback className="text-[0.65rem]">
                  {initials(owner.name)}
                </AvatarFallback>
              </Avatar>
              Responsável: {owner.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-4" />
            {formatDate(project.startDate)} → {formatDate(project.dueDate)}
          </span>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <ProjectTabsPersist initialTab={activeTab} hasExplicitTab={hasExplicitTab}>
        <TabsList className="w-full max-w-full overflow-x-auto">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="etapas">Etapas</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
          <TabsTrigger value="conversa">Conversa</TabsTrigger>
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

          {/* Plano de manutenção (só projetos com plano ativo) */}
          {planBalance && (
            <PortalPlanCard
              projectId={project.id}
              balance={planBalance}
              packages={maintenancePackages}
            />
          )}
        </TabsContent>

        <TabsContent value="etapas" className="pt-4">
          <PortalProjectMilestonesSection
            milestones={milestones}
            tasksByMilestone={tasksByMilestone}
          />
        </TabsContent>

        <TabsContent value="tarefas" className="pt-4">
          <PortalProjectTasksSection
            projectId={project.id}
            milestones={milestones}
            tasks={tasks as PortalTask[]}
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
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="arquivos" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Arquivos do projeto</CardTitle>
              <CardDescription>
                Documentos gerais — você também pode enviar arquivos aqui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentList
                attachments={detail.projectAttachments}
                projectId={project.id}
                currentUserId={user.id}
                currentUserRole={user.role}
                createAction={createPortalAttachment}
                deleteAction={deletePortalAttachment}
                taskHrefBase={`/portal/projetos/${project.id}/tarefas`}
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
                attachments={detail.taskAttachments}
                currentUserId={user.id}
                currentUserRole={user.role}
                readOnly
                taskHrefBase={`/portal/projetos/${project.id}/tarefas`}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="links" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4" />
                Links de visualização
              </CardTitle>
              <CardDescription>
                Ambientes de homologação, previews e URLs úteis do projeto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {links.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum link disponível no momento.
                </p>
              ) : (
                <ul className="space-y-2">
                  {links.map((link) => (
                    <li
                      key={link.id}
                      className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium break-all text-foreground transition-colors hover:text-primary"
                        >
                          <ExternalLink className="size-3.5 shrink-0" />
                          {link.url}
                        </a>
                        {link.version && (
                          <span className="chip border-sky-400/30 bg-sky-400/10 text-sky-300">
                            {link.version}
                          </span>
                        )}
                      </div>
                      {link.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {link.description}
                        </p>
                      )}
                      {link.notes && (
                        <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground/80">
                          {link.notes}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Adicionado {timeAgo(link.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversa" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Conversa do projeto</CardTitle>
              <CardDescription>
                Troque mensagens com a equipe e mencione tarefas quando necessário.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalProjectComments
                projectId={project.id}
                comments={projectComments}
                mentionableUsers={mentionableUsers}
                mentionableTasks={mentionableTasks}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </ProjectTabsPersist>
    </div>
  );
}
