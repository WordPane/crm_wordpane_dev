"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  LogIn,
  MoreHorizontal,
  Pencil,
  Plus,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { CompanyAdminChip, UserStatusChip } from "@/components/chips";
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
import { maskPhone } from "@/lib/format";
import type { CompanyUserItem } from "@/lib/queries/companies";
import {
  companyUserCreateSchema,
  companyUserUpdateSchema,
  type CompanyUserUpdateValues,
} from "@/lib/validations/user";
import {
  createCompanyUser,
  updateCompanyUser,
} from "@/server/actions/company-users";
import { impersonateUser } from "@/server/actions/impersonate";

export function CompanyUsersSection({
  companyId,
  users,
  canImpersonate = false,
}: {
  companyId: string;
  users: CompanyUserItem[];
  /** super admin: habilita "Acessar como" (auto-login no portal do cliente). */
  canImpersonate?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyUserItem | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuários do portal</CardTitle>
        <CardDescription>
          Pessoas desta empresa com acesso ao portal do cliente.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus />
            Novo usuário
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <UserRound className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhum usuário cadastrado</p>
            <p className="text-sm text-muted-foreground">
              Crie o primeiro acesso ao portal para esta empresa.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {u.name}
                      {u.isCompanyAdmin && <CompanyAdminChip />}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.position ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <UserStatusChip status={u.status} />
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
                            setEditing(u);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        {canImpersonate && u.status !== "suspended" && (
                          <DropdownMenuItem
                            onClick={() => {
                              toast.info(`Acessando como ${u.name}...`);
                              impersonateUser(u.id);
                            }}
                          >
                            <LogIn />
                            Acessar como
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

      {dialogOpen && (
        <CompanyUserDialog
          key={editing?.id ?? "new"}
          companyId={companyId}
          user={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </Card>
  );
}

function CompanyUserDialog({
  companyId,
  user,
  open,
  onOpenChange,
}: {
  companyId: string;
  user: CompanyUserItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = user !== null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // O formulário usa um tipo único; o resolver muda conforme criação/edição
  // (a action revalida com o schema adequado em cada fluxo).
  const form = useForm<CompanyUserUpdateValues>({
    resolver: zodResolver(
      isEdit ? companyUserUpdateSchema : companyUserCreateSchema,
    ) as Resolver<CompanyUserUpdateValues>,
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      position: user?.position ?? "",
      password: "",
      status: user?.status ?? "active",
      isCompanyAdmin: user?.isCompanyAdmin ?? false,
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: CompanyUserUpdateValues) {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateCompanyUser(companyId, user.id, values)
        : await createCompanyUser(companyId, values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      toast.success(isEdit ? "Usuário atualizado." : "Usuário criado.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar usuário" : "Novo usuário"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize os dados de acesso ao portal."
              : "Crie um acesso ao portal do cliente para esta empresa."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cu-name">Nome *</Label>
              <Input
                id="cu-name"
                placeholder="Nome completo"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-email">E-mail *</Label>
              <Input
                id="cu-email"
                type="email"
                placeholder="pessoa@empresa.com"
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
              <Label htmlFor="cu-phone">Telefone</Label>
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <Input
                    id="cu-phone"
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(maskPhone(e.target.value))}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-position">Cargo</Label>
              <Input
                id="cu-position"
                placeholder="Ex.: Gerente de TI"
                {...form.register("position")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-password">
                {isEdit ? "Nova senha" : "Senha *"}
              </Label>
              <Input
                id="cu-password"
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

          <Controller
            control={form.control}
            name="isCompanyAdmin"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cu-company-admin"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
                <Label htmlFor="cu-company-admin" className="font-normal">
                  Admin da empresa (gerencia usuários)
                </Label>
              </div>
            )}
          />

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
              {isEdit ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
