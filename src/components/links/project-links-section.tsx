"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectLink } from "@/lib/db/schema";
import { formatDate, timeAgo } from "@/lib/utils/format";
import {
  projectLinkFormSchema,
  type ProjectLinkFormValues,
} from "@/lib/validations/link";
import {
  createProjectLink,
  deleteProjectLink,
  updateProjectLink,
} from "@/server/actions/links";

/** CRUD de links temporários do projeto (tab Links). */
export function ProjectLinksSection({
  projectId,
  links,
}: {
  projectId: string;
  links: ProjectLink[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectLink | null>(null);
  const [deleting, setDeleting] = useState<ProjectLink | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Links temporários</CardTitle>
        <CardDescription>
          Ambientes de homologação, previews e URLs úteis do projeto.
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
            Novo link
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Link2 className="size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhum link cadastrado</p>
            <p className="text-sm text-muted-foreground">
              Adicione links de homologação, previews ou referências.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex items-start gap-3 rounded-xl bg-white/[0.02] p-3 ring-1 ring-foreground/10"
              >
                <div className="min-w-0 flex-1 space-y-1">
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
                    <p className="text-sm text-muted-foreground">
                      {link.description}
                    </p>
                  )}
                  {link.notes && (
                    <p className="text-xs whitespace-pre-wrap text-muted-foreground/80">
                      {link.notes}
                    </p>
                  )}
                  <p
                    className="text-xs text-muted-foreground"
                    title={formatDate(link.createdAt)}
                  >
                    Adicionado {timeAgo(link.createdAt)}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Ações do link"
                      />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(link);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeleting(link)}
                    >
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {dialogOpen && (
        <LinkDialog
          key={editing?.id ?? "new"}
          projectId={projectId}
          link={editing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Excluir link"
        description={`Tem certeza que deseja excluir o link "${deleting?.description || deleting?.url}"?`}
        onConfirm={async () => {
          if (!deleting) return null;
          const result = await deleteProjectLink(deleting.id);
          if ("error" in result) return result.error;
          toast.success("Link excluído.");
          router.refresh();
          return null;
        }}
      />
    </Card>
  );
}

function LinkDialog({
  projectId,
  link,
  open,
  onOpenChange,
}: {
  projectId: string;
  link: ProjectLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = link !== null;
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ProjectLinkFormValues>({
    resolver: zodResolver(projectLinkFormSchema),
    defaultValues: {
      url: link?.url ?? "",
      description: link?.description ?? "",
      version: link?.version ?? "",
      notes: link?.notes ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ProjectLinkFormValues) {
    setError(null);
    const result = isEdit
      ? await updateProjectLink(link.id, values)
      : await createProjectLink(projectId, values);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    toast.success(isEdit ? "Link atualizado." : "Link adicionado.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar link" : "Novo link"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize os dados do link."
              : "Adicione uma URL temporária útil para o projeto."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lk-url">URL *</Label>
            <Input
              id="lk-url"
              placeholder="https://homologacao.exemplo.com"
              aria-invalid={!!errors.url}
              {...form.register("url")}
            />
            {errors.url && (
              <p className="text-xs text-destructive">{errors.url.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lk-description">Descrição</Label>
              <Input
                id="lk-description"
                placeholder="Ex.: Ambiente de homologação"
                {...form.register("description")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lk-version">Versão</Label>
              <Input
                id="lk-version"
                placeholder="Ex.: v1.2"
                {...form.register("version")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lk-notes">Observações</Label>
            <Textarea
              id="lk-notes"
              placeholder="Credenciais, validade, instruções de acesso..."
              rows={3}
              {...form.register("notes")}
            />
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
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isEdit ? "Salvar alterações" : "Adicionar link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
