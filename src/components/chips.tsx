import type {
  ClientRegistration,
  Company,
  Demand,
  Milestone,
  Project,
  Quote,
  User,
} from "@/lib/db/schema";
import {
  demandCategoryLabels,
  demandStatusLabels,
} from "@/lib/validations/demand";
import { quoteStatusLabels } from "@/lib/validations/quote";
import { registrationStatusLabels } from "@/lib/validations/registration";
import {
  milestoneStatusLabels,
  priorityLabels,
} from "@/lib/validations/project";
import { cn } from "@/lib/utils";

const companyStatusLabels: Record<Company["status"], string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  prospect: "Prospect",
};

export function CompanyStatusChip({ status }: { status: Company["status"] }) {
  return (
    <span
      className={cn(
        "chip",
        status === "inativo" &&
          "border-border bg-muted text-muted-foreground",
        status === "prospect" &&
          "border-amber-400/30 bg-amber-400/10 text-amber-300",
      )}
    >
      {companyStatusLabels[status]}
    </span>
  );
}

const userStatusLabels: Record<User["status"], string> = {
  active: "Ativo",
  invited: "Convidado",
  suspended: "Suspenso",
};

export function UserStatusChip({ status }: { status: User["status"] }) {
  return (
    <span
      className={cn(
        "chip",
        status === "suspended" && "border-border bg-muted text-muted-foreground",
        status === "invited" &&
          "border-amber-400/30 bg-amber-400/10 text-amber-300",
      )}
    >
      {userStatusLabels[status]}
    </span>
  );
}

export function RoleChip({ role }: { role: "super_admin" | "admin" }) {
  return (
    <span
      className={cn(
        "chip",
        role === "admin" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {role === "super_admin" ? "Super admin" : "Admin"}
    </span>
  );
}

/** Marca o usuário cliente que gerencia os usuários da própria empresa. */
export function CompanyAdminChip() {
  return <span className="chip">Admin</span>;
}

/** Chip de status configurável (projeto/tarefa) colorido pela cor cadastrada. */
export function StatusColorChip({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  return (
    <span
      className="chip"
      style={{
        color,
        borderColor: `${color}4d`,
        backgroundColor: `${color}1a`,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}

const priorityClasses: Record<Project["priority"], string> = {
  baixa: "border-border bg-muted text-muted-foreground",
  media: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  alta: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  urgente: "border-red-400/30 bg-red-400/10 text-red-300",
};

export function PriorityChip({ priority }: { priority: Project["priority"] }) {
  return (
    <span className={cn("chip", priorityClasses[priority])}>
      {priorityLabels[priority]}
    </span>
  );
}

const milestoneStatusClasses: Record<Milestone["status"], string> = {
  pendente: "border-border bg-muted text-muted-foreground",
  em_andamento: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  concluida: "",
};

export function MilestoneStatusChip({ status }: { status: Milestone["status"] }) {
  return (
    <span className={cn("chip", milestoneStatusClasses[status])}>
      {milestoneStatusLabels[status]}
    </span>
  );
}

const demandStatusClasses: Record<Demand["status"], string> = {
  aberta: "",
  em_analise: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  em_andamento: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  concluida: "border-border bg-muted text-muted-foreground",
  recusada: "border-red-400/30 bg-red-400/10 text-red-300",
};

export function DemandStatusChip({ status }: { status: Demand["status"] }) {
  return (
    <span className={cn("chip", demandStatusClasses[status])}>
      {demandStatusLabels[status]}
    </span>
  );
}

export function DemandCategoryChip({ category }: { category: Demand["category"] }) {
  return (
    <span className="chip border-border bg-muted text-muted-foreground">
      {demandCategoryLabels[category]}
    </span>
  );
}

const quoteStatusClasses: Record<Quote["status"], string> = {
  draft: "border-border bg-muted text-muted-foreground",
  sent: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  approved: "",
  rejected: "border-red-400/30 bg-red-400/10 text-red-300",
};

export function QuoteStatusChip({ status }: { status: Quote["status"] }) {
  return (
    <span className={cn("chip", quoteStatusClasses[status])}>
      {quoteStatusLabels[status]}
    </span>
  );
}

const registrationStatusClasses: Record<ClientRegistration["status"], string> =
  {
    pendente: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    aprovado: "",
    recusado: "border-red-400/30 bg-red-400/10 text-red-300",
  };

export function RegistrationStatusChip({
  status,
}: {
  status: ClientRegistration["status"];
}) {
  return (
    <span className={cn("chip", registrationStatusClasses[status])}>
      {registrationStatusLabels[status]}
    </span>
  );
}
