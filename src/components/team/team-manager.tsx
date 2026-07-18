"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { RoleChip, UserStatusChip } from "@/components/chips";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompanySelectItem, TeamUserItem } from "@/lib/queries/team";
import { cn } from "@/lib/utils";
import {
  teamMemberCreateSchema,
  teamMemberUpdateSchema,
  type TeamMemberUpdateValues,
} from "@/lib/validations/user";
import {
  createTeamMember,
  setAdminAssignments,
  updateTeamMember,
} from "@/server/actions/team";

export function TeamManager({
  members,
  companies,
  assignments,
}: {
  members: TeamUserItem[];
  companies: CompanySelectItem[];
  assignments: Record<string, string[]>;
}) {
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamUserItem | null>(null);
  const [assignmentsFor, setAssignmentsFor] = useState<TeamUserItem | null>(
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membros da equipe</CardTitle>
        <CardDescription>
          Super admins enxergam tudo; admins enxergam apenas as empresas
          atribuídas a eles.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setMemberDialogOpen(true);
            }}
          >
            <Plus />
            Novo membro
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhum membro na equipe</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.position ?? "—"}
                  </TableCell>
                  <TableCell>
                    <RoleChip role={m.role} />
                  </TableCell>
                  <TableCell>
                    <UserStatusChip status={m.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.role === "super_admin"
                      ? "Todas"
                      : m.assignedCount === 1
                        ? "1 empresa"
                        : `${m.assignedCount} empresas`}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Ações"
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(m);
                            setMemberDialogOpen(true);
                          }}
                        >
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        {m.role === "admin" && (
                          <DropdownMenuItem
                            onClick={() => setAssignmentsFor(m)}
                          >
                            <Building2 />
                            Empresas atribuídas
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {memberDialogOpen && (
        <TeamMemberDialog
          key={editing?.id ?? "new"}
          member={editing}
          open={memberDialogOpen}
          onOpenChange={setMemberDialogOpen}
        />
      )}

      {assignmentsFor && (
        <AssignmentsDialog
          key={assignmentsFor.id}
          member={assignmentsFor}
          companies={companies}
          initialSelected={assignments[assignmentsFor.id] ?? []}
          open={assignmentsFor !== null}
          onOpenChange={(open) => {
            if (!open) setAssignmentsFor(null);
          }}
        />
      )}
    </Card>
  );
}

function TeamMemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: TeamUserItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = member !== null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // O formulário usa um tipo único; o resolver muda conforme criação/edição
  // (a action revalida com o schema adequado em cada fluxo).
  const form = useForm<TeamMemberUpdateValues>({
    resolver: zodResolver(
      isEdit ? teamMemberUpdateSchema : teamMemberCreateSchema,
    ) as Resolver<TeamMemberUpdateValues>,
    defaultValues: {
      name: member?.name ?? "",
      email: member?.email ?? "",
      position: member?.position ?? "",
      role: member?.role ?? "admin",
      password: "",
      status: member?.status ?? "active",
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: TeamMemberUpdateValues) {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateTeamMember(member.id, values)
        : await createTeamMember(values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      toast.success(isEdit ? "Membro atualizado." : "Membro adicionado.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar membro" : "Novo membro"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize os dados do membro da equipe."
              : "Adicione um membro à equipe interna."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tm-name">Nome *</Label>
              <Input
                id="tm-name"
                placeholder="Nome completo"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-email">E-mail *</Label>
              <Input
                id="tm-email"
                type="email"
                placeholder="pessoa@wordpane.com"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-position">Cargo</Label>
              <Input
                id="tm-position"
                placeholder="Ex.: Gerente de projetos"
                {...form.register("position")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione">
                        {(value: string | null) =>
                          value === "admin"
                            ? "Admin"
                            : value === "super_admin"
                              ? "Super admin"
                              : "Selecione"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-password">
                {isEdit ? "Nova senha" : "Senha *"}
              </Label>
              <Input
                id="tm-password"
                type="password"
                placeholder={
                  isEdit ? "Deixe em branco para manter" : "Mín. 6 caracteres"
                }
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione">
                        {(value: string | null) =>
                          value === "active"
                            ? "Ativo"
                            : value === "invited"
                              ? "Convidado"
                              : value === "suspended"
                                ? "Suspenso"
                                : "Selecione"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="invited">Convidado</SelectItem>
                      <SelectItem value="suspended">Suspenso</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {isEdit ? "Salvar alterações" : "Adicionar membro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentsDialog({
  member,
  companies,
  initialSelected,
  open,
  onOpenChange,
}: {
  member: TeamUserItem;
  companies: CompanySelectItem[];
  initialSelected: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected),
  );
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleCompanies = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, filter]);

  function setCompany(companyId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(companyId);
      else next.delete(companyId);
      return next;
    });
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await setAdminAssignments(member.id, [...selected]);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Atribuições atualizadas.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Empresas atribuídas</DialogTitle>
          <DialogDescription>
            {member.name} enxergará apenas as empresas selecionadas abaixo.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar empresas..."
          aria-label="Filtrar empresas"
        />

        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {visibleCompanies.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nenhuma empresa encontrada.
            </p>
          ) : (
            visibleCompanies.map((c) => {
              const checked = selected.has(c.id);
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setCompany(c.id, !checked)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setCompany(c.id, !checked);
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                    checked && "bg-[rgba(0,209,100,0.06)]",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => setCompany(c.id, value)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Atribuir ${c.name}`}
                  />
                  <span className="truncate">{c.name}</span>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {selected.size}{" "}
          {selected.size === 1
            ? "empresa selecionada"
            : "empresas selecionadas"}
        </p>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={onSave}>
            {pending && <Loader2 className="animate-spin" />}
            Salvar atribuições
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
