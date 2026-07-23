import type { Metadata } from "next";
import {
  ArrowDownToLine,
  CalendarClock,
  Clock3,
  FileText,
  FolderKanban,
  ListChecks,
  MessageSquare,
  Paperclip,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
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

/** Linha de stat com mini barra de proporção (card Operação). */
function OpRow({
  label,
  value,
  total,
  alert = false,
  href,
}: {
  label: string;
  value: number;
  total: number;
  alert?: boolean;
  /** Quando presente, a linha vira link (ex.: lista filtrada de tarefas). */
  href?: string;
}) {
  const pct = total > 0 ? Math.max(Math.round((value / total) * 100), value > 0 ? 4 : 0) : 0;
  const body = (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={
            alert && value > 0
              ? "font-semibold text-[#ff6b6b]"
              : "font-semibold"
          }
        >
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${alert ? "bg-[#ff6b6b]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block rounded-md transition-opacity hover:opacity-70">
      {body}
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const user = await requireUser();
  requireTeam(user);

  const {
    counts,
    revenueByMonth,
    receivables,
    upcoming,
    activities,
    uploads,
    comments,
  } = await getAdminDashboard(user);

  const financeCards = [
    {
      label: "Recebido no mês",
      value: formatCurrency(counts.chargesReceivedMonthCents),
      icon: ArrowDownToLine,
      alert: false,
      href: "/admin/financeiro",
    },
    {
      label: "Cobranças em aberto",
      value: formatCurrency(counts.chargesOpenCents),
      hint: `${counts.chargesOpen} ${counts.chargesOpen === 1 ? "cobrança" : "cobranças"}`,
      icon: Clock3,
      alert: false,
      href: "/admin/financeiro",
    },
    {
      label: "Cobranças vencidas",
      value: counts.chargesOverdue,
      icon: TriangleAlert,
      alert: counts.chargesOverdue > 0,
      href: "/admin/financeiro?status=overdue",
    },
    {
      label: "Orçamentos aguardando",
      value: counts.quotesPending,
      icon: FileText,
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

      {/* ─── KPIs financeiros ─── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {financeCards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="flex items-center gap-4 py-5">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                    card.alert
                      ? "bg-[rgba(255,107,107,0.1)] text-[#ff6b6b] ring-[rgba(255,107,107,0.3)]"
                      : "bg-primary/10 text-primary ring-primary/25"
                  }`}
                >
                  <card.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">
                    {card.label}
                  </p>
                  <p
                    className={`truncate text-2xl font-extrabold ${card.alert ? "text-[#ff6b6b]" : ""}`}
                  >
                    {card.value}
                  </p>
                  {"hint" in card && card.hint && (
                    <p className="text-xs text-muted-foreground">{card.hint}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ─── Receita (largura total) ─── */}
      <Card>
        <CardHeader>
          <CardTitle>Receita</CardTitle>
          <CardDescription>
            Cobranças pagas nos últimos 6 meses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChart data={revenueByMonth} />
        </CardContent>
      </Card>

      {/* ─── Vencimentos + atividades ─── */}
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
                          className="block truncate text-sm font-medium transition-colors hover:text-primary"
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
      </div>

      {/* ─── A receber + operação ─── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>A receber</CardTitle>
            <CardDescription>
              Cobranças em aberto por ordem de vencimento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {receivables.length === 0 ? (
              <EmptySection
                icon={Wallet}
                message="Nenhuma cobrança em aberto no momento."
              />
            ) : (
              <ul className="divide-y divide-border">
                {receivables.map((charge) => (
                  <li
                    key={charge.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
                      <Wallet className="size-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/admin/financeiro"
                        className="block truncate text-sm font-medium transition-colors hover:text-primary"
                      >
                        {charge.description}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {charge.companyName} · {formatCurrency(charge.valueCents)}
                      </p>
                    </div>
                    <DueChip daysLeft={charge.daysLeft} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operação</CardTitle>
            <CardDescription>
              Prazos e responsáveis das tarefas em aberto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Tarefas
              </p>
              <OpRow
                label="Vencidas"
                value={counts.tasksOverdue}
                total={counts.tasksOpen}
                alert
                href="/admin/tarefas?vencimento=vencidas"
              />
              <OpRow
                label="Vencem esta semana"
                value={counts.tasksDueWeek}
                total={counts.tasksOpen}
                href="/admin/tarefas?vencimento=semana"
              />
              <OpRow
                label="Sem responsável"
                value={counts.tasksUnassigned}
                total={counts.tasksOpen}
                alert
                href="/admin/tarefas?concluidas=nao"
              />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Tarefas em aberto</span>
              <span className="font-semibold">{counts.tasksOpen}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Secundário ─── */}
      <div className="grid gap-4 xl:grid-cols-2">
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
                        className="block truncate text-sm font-medium transition-colors hover:text-primary"
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
                          className="font-medium transition-colors hover:text-primary"
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
