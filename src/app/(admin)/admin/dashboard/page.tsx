import type { Metadata } from "next";
import {
  CalendarClock,
  FolderKanban,
  ListChecks,
  MessageSquare,
  Paperclip,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ActivityTimeline } from "@/components/activities/activity-timeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { getAdminDashboard } from "@/lib/queries/dashboard";
import { formatCurrency, formatDate, formatFileSize, timeAgo } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Dashboard" };

function DueChip({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0) {
    const days = -daysLeft;
    return (
      <span className="inline-flex shrink-0 items-center rounded-full border border-[rgba(255,107,107,0.3)] bg-[rgba(255,107,107,0.08)] px-2.5 py-0.5 text-[0.72rem] font-semibold whitespace-nowrap text-[#ff6b6b]">
        vencido há {days} {days === 1 ? "dia" : "dias"}
      </span>
    );
  }
  if (daysLeft === 0) return <span className="chip">vence hoje</span>;
  return (
    <span className="chip">
      em {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
    </span>
  );
}

function EmptySection({
  icon: Icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon className="size-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const user = await requireUser();
  requireTeam(user);

  const { counts, upcoming, activities, uploads, comments } =
    await getAdminDashboard(user);

  const cards = [
    { label: "Projetos em andamento", value: counts.projectsActive },
    { label: "Projetos concluídos", value: counts.projectsDone },
    {
      label: "Projetos atrasados",
      value: counts.projectsOverdue,
      alert: counts.projectsOverdue > 0,
    },
    { label: "Demandas abertas", value: counts.demandsOpen },
    { label: "Demandas em andamento", value: counts.demandsInProgress },
    { label: "Demandas concluídas", value: counts.demandsDone },
    { label: "Clientes ativos", value: counts.clientsActive },
  ];

  const financeCards = [
    {
      label: "Recebido no mês",
      value: formatCurrency(counts.chargesReceivedMonthCents),
      alert: false,
      href: "/admin/financeiro",
    },
    {
      label: "Cobranças em aberto",
      value: formatCurrency(counts.chargesOpenCents),
      hint: `${counts.chargesOpen} ${counts.chargesOpen === 1 ? "cobrança" : "cobranças"}`,
      alert: false,
      href: "/admin/financeiro",
    },
    {
      label: "Cobranças vencidas",
      value: counts.chargesOverdue,
      alert: counts.chargesOverdue > 0,
      href: "/admin/financeiro?status=overdue",
    },
    {
      label: "Orçamentos aguardando resposta",
      value: counts.quotesPending,
      alert: false,
      href: "/admin/orcamentos?status=sent",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Olá, {user.name.split(" ")[0]} — visão geral da operação.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {financeCards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="h-full transition-colors hover:border-[rgba(0,209,100,0.4)]">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-3xl font-extrabold ${card.alert ? "text-[#ff6b6b]" : "text-[#00d164]"}`}
                >
                  {card.value}
                </p>
                {"hint" in card && card.hint && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {card.hint}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-3xl font-extrabold ${card.alert ? "text-[#ff6b6b]" : "text-[#00d164]"}`}
              >
                {card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próximos vencimentos</CardTitle>
            <CardDescription>
              Projetos e tarefas vencidos ou com prazo nos próximos 30 dias.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptySection
                icon={CalendarClock}
                message="Nenhum prazo vencido ou próximo. Bom ritmo!"
              />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((item) => {
                  const Icon = item.kind === "project" ? FolderKanban : ListChecks;
                  return (
                    <li
                      key={`${item.kind}-${item.id}`}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                        <Icon className="size-3.5 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={item.href}
                          className="block truncate text-sm font-medium transition-colors hover:text-[#00d164]"
                        >
                          {item.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.subtitle} · {formatDate(item.dueDate)}
                        </p>
                      </div>
                      <DueChip daysLeft={item.daysLeft} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividades recentes</CardTitle>
            <CardDescription>
              O que aconteceu nas empresas do seu escopo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityTimeline activities={activities} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos uploads</CardTitle>
            <CardDescription>
              Arquivos anexados recentemente por equipe e clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uploads.length === 0 ? (
              <EmptySection
                icon={Paperclip}
                message="Nenhum arquivo enviado ainda."
              />
            ) : (
              <ul className="divide-y divide-border">
                {uploads.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                      <Paperclip className="size-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={file.href}
                        className="block truncate text-sm font-medium transition-colors hover:text-[#00d164]"
                      >
                        {file.fileName}
                      </a>
                      <p className="truncate text-xs text-muted-foreground">
                        {[file.origin, file.uploaderName, timeAgo(file.createdAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatFileSize(file.fileSize)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos comentários</CardTitle>
            <CardDescription>
              Discussões mais recentes nas tarefas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {comments.length === 0 ? (
              <EmptySection
                icon={MessageSquare}
                message="Nenhum comentário registrado ainda."
              />
            ) : (
              <ul className="divide-y divide-border">
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                      <MessageSquare className="size-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">
                          {comment.authorName ?? "Alguém"}
                        </span>{" "}
                        <span className="text-muted-foreground">em</span>{" "}
                        <Link
                          href={comment.href}
                          className="font-medium transition-colors hover:text-[#00d164]"
                        >
                          {comment.taskTitle}
                        </Link>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {comment.excerpt}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {timeAgo(comment.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
