import {
  Building2,
  Clock,
  FileText,
  Flag,
  FolderKanban,
  Inbox,
  Link2,
  ListChecks,
  MessageSquare,
  Paperclip,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { ActivityItem } from "@/lib/queries/activities";
import { formatDateTime, timeAgo } from "@/lib/utils/format";

const ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  task: ListChecks,
  comment: MessageSquare,
  attachment: Paperclip,
  link: Link2,
  milestone: Flag,
  demand: Inbox,
  member: Users,
  company: Building2,
  quote: FileText,
  charge: Wallet,
  service: Wallet,
};

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Texto legível em pt-BR a partir de action + metadata. */
function describe(activity: ActivityItem): string {
  const m = activity.metadata ?? {};
  switch (activity.action) {
    case "project.created":
      return `criou o projeto "${str(m.title) ?? ""}"`;
    case "project.updated":
      return "atualizou os dados do projeto";
    case "project.status_changed":
      return `mudou o status do projeto de "${str(m.from) ?? "—"}" para "${str(m.to) ?? "—"}"`;
    case "project.deleted":
      return `excluiu o projeto "${str(m.title) ?? ""}"`;
    case "project.template_applied": {
      const count = typeof m.milestones === "number" ? m.milestones : 0;
      const taskCount = typeof m.tasks === "number" ? m.tasks : 0;
      return `aplicou o modelo "${str(m.name) ?? ""}" (${count} ${count === 1 ? "etapa" : "etapas"}, ${taskCount} ${taskCount === 1 ? "tarefa" : "tarefas"})`;
    }
    case "task.created":
      return `criou a tarefa "${str(m.title) ?? ""}"`;
    case "task.status_changed":
      return `moveu a tarefa "${str(m.title) ?? ""}" de "${str(m.from) ?? "—"}" para "${str(m.to) ?? "—"}"`;
    case "task.milestone_changed":
      return `moveu a tarefa "${str(m.title) ?? ""}" da etapa "${str(m.from) ?? "Sem etapa"}" para "${str(m.to) ?? "Sem etapa"}"`;
    case "task.completed":
      return `concluiu a tarefa "${str(m.title) ?? ""}"`;
    case "task.deleted":
      return `excluiu a tarefa "${str(m.title) ?? ""}"`;
    case "milestone.created":
      return `criou a etapa "${str(m.title) ?? ""}"`;
    case "milestone.completed":
      return `concluiu a etapa "${str(m.title) ?? ""}"`;
    case "milestone.reopened":
      return `reabriu a etapa "${str(m.title) ?? ""}"`;
    case "member.added":
      return `adicionou ${str(m.name) ?? "um membro"} à equipe do projeto`;
    case "member.removed":
      return `removeu ${str(m.name) ?? "um membro"} da equipe do projeto`;
    case "comment.added":
      return `comentou em "${str(m.taskTitle) ?? ""}"`;
    case "upload.added":
      return `anexou "${str(m.fileName) ?? ""}" em "${str(m.target) ?? ""}"`;
    case "link.added":
      return `adicionou o link ${str(m.description) ?? str(m.url) ?? ""}`;
    case "demand.created":
      return `enviou a demanda "${str(m.title) ?? ""}"`;
    case "demand.status_changed":
      return `mudou o status da demanda "${str(m.title) ?? ""}" de "${str(m.from) ?? "—"}" para "${str(m.to) ?? "—"}"`;
    case "demand.updated":
      return `editou a demanda "${str(m.title) ?? ""}"`;
    case "demand.deleted":
      return `excluiu a demanda "${str(m.title) ?? ""}"`;
    case "demand.converted":
      return `converteu a demanda "${str(m.title) ?? ""}" em tarefa`;
    case "quote.created":
      return `criou o orçamento ${str(m.number) ?? ""} "${str(m.title) ?? ""}"`;
    case "quote.deleted":
      return `excluiu o orçamento ${str(m.number) ?? ""}`;
    case "quote.sent":
      return `enviou o orçamento ${str(m.number) ?? ""} ao cliente`;
    case "quote.approved":
      return `aprovou o orçamento ${str(m.number) ?? ""}`;
    case "quote.rejected":
      return `recusou o orçamento ${str(m.number) ?? ""}`;
    case "quote.duplicated":
      return `duplicou o orçamento ${str(m.from) ?? ""} como ${str(m.number) ?? ""} (v${typeof m.version === "number" ? m.version : "?"})`;
    case "quote.project_created":
      return `criou um projeto a partir do orçamento ${str(m.number) ?? ""}`;
    case "charge.created":
      return `criou a cobrança "${str(m.description) ?? ""}" (${str(m.value) ?? ""})`;
    case "charge.received":
      return `recebeu o pagamento de "${str(m.description) ?? ""}" (${str(m.value) ?? ""})`;
    case "charge.cancelled":
      return `cancelou a cobrança "${str(m.description) ?? ""}"`;
    case "charge.deleted":
      return `excluiu a fatura "${str(m.description) ?? ""}"`;
    case "charge.updated":
      return `editou a cobrança "${str(m.description) ?? ""}"`;
    case "service.activated":
      return `ativou o serviço "${str(m.service) ?? ""}" (${str(m.value) ?? ""})`;
    case "service.deactivated":
      return `cancelou a assinatura de "${str(m.service) ?? ""}"`;
    case "company.created":
      return m.origin === "cadastro_publico"
        ? "aprovou o cadastro público e criou a empresa"
        : "criou a empresa";
    case "auth.impersonated":
      return `acessou o portal como ${str(m.user) ?? ""}`;
    default:
      return activity.action;
  }
}

/** Frase completa para eventos sem autor (sistema/webhook/link público). */
function describeSystem(activity: ActivityItem): string {
  const m = activity.metadata ?? {};
  if (activity.action === "charge.received") {
    const company = str(m.company);
    const description = str(m.description) ?? "";
    const value = str(m.value) ?? "";
    return company
      ? `Recebemos o pagamento de ${company} — "${description}" (${value})`
      : `Recebemos o pagamento de "${description}" (${value})`;
  }
  // Resposta via link público: sem autor — o nome vai no metadata
  if (
    activity.action === "quote.approved" ||
    activity.action === "quote.rejected"
  ) {
    const verb = activity.action === "quote.approved" ? "aprovou" : "recusou";
    return `${str(m.name) ?? "O cliente"} ${verb} o orçamento ${str(m.number) ?? ""}`;
  }
  if (activity.action === "auth.impersonated") {
    return `${str(m.admin) ?? "O super admin"} acessou o portal como ${str(m.user) ?? ""}`;
  }
  return describe(activity);
}

/** Timeline vertical de atividades (projeto ou tarefa). */
export function ActivityTimeline({
  activities,
}: {
  activities: ActivityItem[];
}) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Clock className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Nenhuma atividade registrada ainda.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative ml-4 space-y-6 border-l border-border pl-8">
      {activities.map((activity) => {
        const Icon = ICONS[activity.entityType] ?? Clock;
        return (
          <li key={activity.id} className="relative">
            <span className="absolute top-0 -left-12 flex size-8 items-center justify-center rounded-full bg-muted ring-1 ring-border">
              <Icon className="size-3.5 text-muted-foreground" />
            </span>
            <p className="text-sm leading-snug">
              {activity.actor ? (
                <>
                  <span className="font-medium">{activity.actor.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {describe(activity)}
                  </span>
                </>
              ) : (
                <span className="font-medium">
                  {describeSystem(activity)}
                </span>
              )}
            </p>
            <p
              className="mt-0.5 text-xs text-muted-foreground"
              title={formatDateTime(activity.createdAt)}
            >
              {timeAgo(activity.createdAt)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
