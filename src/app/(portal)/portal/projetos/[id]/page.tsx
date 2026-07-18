import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Flag,
  Link2,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { AttachmentList } from "@/components/attachments/attachment-list";
import {
  MilestoneStatusChip,
  PriorityChip,
  StatusColorChip,
} from "@/components/chips";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { getPortalProject } from "@/lib/queries/portal";
import { formatDate, initials, timeAgo } from "@/lib/utils/format";
import {
  createPortalAttachment,
  deletePortalAttachment,
} from "@/server/actions/portal";

export const metadata: Metadata = { title: "Projeto" };

export default async function PortalProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  let detail;
  try {
    detail = await getPortalProject(user, id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!detail) notFound();

  const { project, status, owner, milestones, tasks, links, activities } = detail;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status?.isFinal).length;
  const percent =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const tasksByMilestone = new Map<string | null, typeof tasks>();
  for (const task of tasks) {
    const list = tasksByMilestone.get(task.milestoneId) ?? [];
    list.push(task);
    tasksByMilestone.set(task.milestoneId, list);
  }
  const looseTasks = tasksByMilestone.get(null) ?? [];

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
          <h1 className="text-2xl font-extrabold">{project.name}</h1>
          {status && <StatusColorChip name={status.name} color={status.color} />}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-4" />
            Prazo: {formatDate(project.dueDate)}
          </span>
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
        </div>
      </div>

      {/* ─── Descrição + progresso ─── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sobre o projeto</CardTitle>
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
              <span className="text-sm font-medium tabular-nums">{percent}%</span>
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
                <dt className="text-muted-foreground">Etapas</dt>
                <dd>{milestones.length}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* ─── Etapas ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="size-4" />
            Etapas
          </CardTitle>
          <CardDescription>
            Fases do projeto e as tarefas visíveis para você.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {milestones.length === 0 && looseTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma etapa cadastrada ainda.
            </p>
          ) : (
            <>
              {milestones.map((milestone) => {
                const milestoneTasks = tasksByMilestone.get(milestone.id) ?? [];
                return (
                  <section key={milestone.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{milestone.name}</h3>
                      <MilestoneStatusChip status={milestone.status} />
                      {milestone.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          até {formatDate(milestone.dueDate)}
                        </span>
                      )}
                    </div>
                    {milestoneTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma tarefa visível nesta etapa.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {milestoneTasks.map((task) => (
                          <li key={task.id}>
                            <Link
                              href={`/portal/projetos/${project.id}/tarefas/${task.id}`}
                              className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10 transition-colors hover:ring-[rgba(0,209,100,0.4)]"
                            >
                              <ListChecks className="size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {task.title}
                              </span>
                              {task.status && (
                                <StatusColorChip
                                  name={task.status.name}
                                  color={task.status.color}
                                />
                              )}
                              <PriorityChip priority={task.priority} />
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="size-3" />
                                {formatDate(task.dueDate)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}

              {looseTasks.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    Sem etapa
                  </h3>
                  <ul className="space-y-1.5">
                    {looseTasks.map((task) => (
                      <li key={task.id}>
                        <Link
                          href={`/portal/projetos/${project.id}/tarefas/${task.id}`}
                          className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10 transition-colors hover:ring-[rgba(0,209,100,0.4)]"
                        >
                          <ListChecks className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {task.title}
                          </span>
                          {task.status && (
                            <StatusColorChip
                              name={task.status.name}
                              color={task.status.color}
                            />
                          )}
                          <PriorityChip priority={task.priority} />
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="size-3" />
                            {formatDate(task.dueDate)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Links de visualização ─── */}
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
                      className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium break-all text-foreground transition-colors hover:text-[#00d164]"
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

      {/* ─── Arquivos ─── */}
      <div className="grid gap-6 lg:grid-cols-2">
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
              Arquivos enviados nas tarefas visíveis deste projeto.
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
      </div>

      {/* ─── Andamento ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Andamento</CardTitle>
          <CardDescription>
            Atividades recentes do projeto, da mais nova para a mais antiga.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTimeline activities={activities} />
        </CardContent>
      </Card>
    </div>
  );
}
