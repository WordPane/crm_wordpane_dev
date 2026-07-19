import type { Metadata } from "next";
import { ArrowLeft, Calendar, CheckCircle2, ChevronRight, Circle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { PriorityChip, StatusColorChip } from "@/components/chips";
import { PortalTaskComments } from "@/components/portal/portal-task-comments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ForbiddenError, requireUser } from "@/lib/access/permissions";
import { listMentionableUsers } from "@/lib/queries/comments";
import { getPortalTask } from "@/lib/queries/portal";
import { formatDate, isOverdue } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import {
  createPortalAttachment,
  deletePortalAttachment,
} from "@/server/actions/portal";

export const metadata: Metadata = { title: "Tarefa" };

export default async function PortalTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const user = await requireUser();
  const { id, taskId } = await params;

  let detail;
  try {
    detail = await getPortalTask(user, id, taskId);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!detail) notFound();

  const { task, project, milestone, status, ownerName, checklist, comments } = detail;
  const mentionableUsers = user.companyId
    ? await listMentionableUsers(user.companyId)
    : [];
  const overdue = !task.completedAt && isOverdue(task.dueDate);
  const doneItems = checklist.filter((item) => item.done).length;
  const checklistPercent =
    checklist.length > 0 ? Math.round((doneItems / checklist.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="space-y-3">
        <Link
          href={`/portal/projetos/${project.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para o projeto
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link
            href={`/portal/projetos/${project.id}`}
            className="transition-colors hover:text-foreground"
          >
            {project.name}
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{task.title}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold break-words">{task.title}</h1>
          {status && <StatusColorChip name={status.name} color={status.color} />}
          <PriorityChip priority={task.priority} />
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
              overdue && "font-medium text-red-300",
            )}
          >
            <Calendar className="size-4" />
            {formatDate(task.dueDate)}
          </span>
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

          {checklist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Checklist</CardTitle>
                <CardDescription>
                  {doneItems} de {checklist.length} itens concluídos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={checklistPercent} />
                <ul className="space-y-1">
                  {checklist.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 py-1">
                      {item.done ? (
                        <CheckCircle2 className="size-4 shrink-0 text-[#00d164]" />
                      ) : (
                        <Circle className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          item.done && "text-muted-foreground line-through",
                        )}
                      >
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Comentários</CardTitle>
              <CardDescription>
                Converse com a equipe sobre esta tarefa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PortalTaskComments
                taskId={task.id}
                comments={comments}
                mentionableUsers={mentionableUsers}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Arquivos</CardTitle>
              <CardDescription>
                Anexos da tarefa — você também pode enviar arquivos aqui.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentList
                attachments={detail.attachments}
                taskId={task.id}
                currentUserId={user.id}
                currentUserRole={user.role}
                createAction={createPortalAttachment}
                deleteAction={deletePortalAttachment}
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
                <dt className="text-muted-foreground">Responsável</dt>
                <dd>{ownerName ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Projeto</dt>
                <dd>
                  <Link
                    href={`/portal/projetos/${project.id}`}
                    className="transition-colors hover:text-[#00d164]"
                  >
                    {project.name}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Concluída em</dt>
                <dd>{formatDate(task.completedAt)}</dd>
              </div>
            </dl>

            <Separator />

            <p className="text-xs text-muted-foreground">
              Criada em {formatDate(task.createdAt)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
