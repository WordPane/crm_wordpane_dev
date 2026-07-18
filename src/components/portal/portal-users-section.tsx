"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
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
import { Card, CardContent } from "@/components/ui/card";
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
import type { PortalCompanyUserItem } from "@/lib/queries/portal";
import {
  portalUserCreateSchema,
  portalUserUpdateSchema,
  type PortalUserUpdateValues,
} from "@/lib/validations/portal";
import {
  createPortalCompanyUser,
  updatePortalCompanyUser,
} from "@/server/actions/portal-users";

export function PortalUsersSection({
  users,
}: {
  users: PortalCompanyUserItem[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PortalCompanyUserItem | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Pessoas da sua empresa com acesso ao portal.
          </p>
        </div>
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
      </div>

      <Card>
        <CardContent>
          {users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <UserRound className="size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhum usuário cadastrado</p>
              <p className="text-sm text-muted-foreground">
                Crie o primeiro acesso ao portal para a sua empresa.
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <PortalUserDialog
          key={editing?.id ?? "new"}
          user={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}

function PortalUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PortalCompanyUserItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = user !== null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // O formulário usa um tipo único; o resolver muda conforme criação/edição
  // (a action revalida com o schema adequado em cada fluxo).
  const form = useForm<PortalUserUpdateValues>({
    resolver: zodResolver(
      isEdit ? portalUserUpdateSchema : portalUserCreateSchema,
    ) as Resolver<PortalUserUpdateValues>,
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

  function onSubmit(values: PortalUserUpdateValues) {
    setError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updatePortalCompanyUser(user.id, values)
        : await createPortalCompanyUser(values);

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
              : "Crie um acesso ao portal para alguém da sua empresa."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pu-name">Nome *</Label>
              <Input
                id="pu-name"
                placeholder="Nome completo"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pu-email">E-mail *</Label>
              <Input
                id="pu-email"
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
              <Label htmlFor="pu-phone">Telefone</Label>
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <Input
                    id="pu-phone"
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
              <Label htmlFor="pu-position">Cargo</Label>
              <Input
                id="pu-position"
                placeholder="Ex.: Gerente de TI"
                {...form.register("position")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pu-password">
                {isEdit ? "Nova senha" : "Senha *"}
              </Label>
              <Input
                id="pu-password"
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
                  id="pu-company-admin"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
                <Label htmlFor="pu-company-admin" className="font-normal">
                  Pode gerenciar usuários
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
