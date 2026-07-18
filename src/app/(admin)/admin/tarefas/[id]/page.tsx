import type { Metadata } from "next";
import { ArrowLeft, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { PriorityChip, StatusColorChip } from "@/components/chips";
import { TaskComments } from "@/components/comments/task-comments";
import { TaskChecklist } from "@/components/tasks/task-checklist";
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog";
import { TaskSidebarControls } from "@/components/tasks/task-sidebar-controls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ForbiddenError,
  requireTeam,
  requireUser,
} from "@/lib/access/permissions";
import { listTaskActivities } from "@/lib/queries/activities";
import { listTaskAttachments } from "@/lib/queries/attachments";
import { listTaskComments } from "@/lib/queries/comments";
import { getTask, listActiveTaskStatuses } from "@/lib/queries/tasks";
import { listTeamSelectOptions } from "@/lib/queries/team";
import { formatDate, isOverdue, timeAgo } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Detalhes da tarefa" };

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { id } = await params;

  let detail;
  try {
    detail = await getTask(user, id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!detail) notFound();

  const { task, project, company, milestone, status, creator, checklist } =
    detail;

  const [statuses, teamUsers, comments, taskAttachments, taskActivities] =
    await Promise.all([
      listActiveTaskStatuses(user),
      listTeamSelectOptions(user),
      listTaskComments(user, task.id),
      listTaskAttachments(user, task.id),
      listTaskActivities(user, task.id),
    ]);

  const overdue = !task.completedAt && isOverdue(task.dueDate);

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="space-y-3">
        <Link
          href="/admin/tarefas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para tarefas
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link
            href={`/admin/projetos/${project.id}`}
            className="transition-colors hover:text-foreground"
          >
            {project.name}
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{task.title}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold">{task.title}</h1>
            {status && <StatusColorChip name={status.name} color={status.color} />}
            <PriorityChip priority={task.priority} />
            {task.origin === "demanda_cliente" && (
              <span className="chip border-amber-400/30 bg-amber-400/10 text-amber-300">
                Demanda do cliente
              </span>
            )}
          </div>
          <TaskEditDialog
            taskId={task.id}
            title={task.title}
            description={task.description ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ─── Coluna principal ─── */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              {task.description ? (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {task.description}
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
              <CardTitle>Checklist</CardTitle>
              <CardDescription>
                Subtarefas e itens de verificação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TaskChecklist taskId={task.id} items={checklist} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comentários</CardTitle>
              <CardDescription>
                Conversa da equipe e do cliente sobre esta tarefa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TaskComments
                taskId={task.id}
                comments={comments}
                currentUserId={user.id}
                currentUserRole={user.role}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
              <CardDescription>
                Eventos registrados nesta tarefa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={taskActivities} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Arquivos</CardTitle>
              <CardDescription>
                Anexos enviados pela equipe ou pelo cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentList
                attachments={taskAttachments}
                taskId={task.id}
                currentUserId={user.id}
                currentUserRole={user.role}
              />
            </CardContent>
          </Card>
        </div>

        {/* ─── Coluna lateral ─── */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TaskSidebarControls
              taskId={task.id}
              ownerId={task.ownerId}
              statusId={task.statusId}
              visibleToClient={task.visibleToClient}
              statuses={statuses}
              teamUsers={teamUsers}
            />

            <Separator />

            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Prazo</dt>
                <dd className={cn(overdue && "font-medium text-red-300")}>
                  {formatDate(task.dueDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Etapa</dt>
                <dd>{milestone?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Empresa</dt>
                <dd>
                  <Link
                    href={`/admin/clientes/${company.id}`}
                    className="transition-colors hover:text-[#00d164]"
                  >
                    {company.name}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Origem</dt>
                <dd>
                  {task.origin === "demanda_cliente"
                    ? "Demanda do cliente"
                    : "Interna"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Concluída em</dt>
                <dd>{formatDate(task.completedAt)}</dd>
              </div>
            </dl>

            <Separator />

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" />
              Criada por {creator?.name ?? "—"} {timeAgo(task.createdAt)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
