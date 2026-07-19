"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { RegistrationStatusChip } from "@/components/chips";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { RegistrationListItem } from "@/lib/queries/registrations";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils/format";
import {
  rejectRegistrationSchema,
  type RejectRegistrationValues,
} from "@/lib/validations/registration";
import {
  approveRegistration,
  rejectRegistration,
} from "@/server/actions/registrations";

function DetailItem({
  label,
  children,
}: {
  label: string;
  children?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-sm break-words">{children?.trim() ? children : "—"}</p>
    </div>
  );
}

function DetailSection({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** Triagem de cadastros públicos: linha expansível + aprovar/recusar. */
export function RegistrationList({
  registrations,
}: {
  registrations: RegistrationListItem[];
}) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approving, setApproving] = useState<RegistrationListItem | null>(null);
  const [rejecting, setRejecting] = useState<RegistrationListItem | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Empresa</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registrations.map((registration) => {
              const expanded = expandedId === registration.id;
              const companyName =
                registration.nomeFantasia || registration.razaoSocial;
              const location = [registration.cidade, registration.estado]
                .filter(Boolean)
                .join("/");
              return [
                <TableRow
                  key={registration.id}
                  className="cursor-pointer"
                  onClick={() =>
                    setExpandedId(expanded ? null : registration.id)
                  }
                >
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <ChevronDown
                        className={cn(
                          "size-3.5 text-muted-foreground transition-transform",
                          !expanded && "-rotate-90",
                        )}
                      />
                      {companyName}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {registration.userName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {registration.userEmail}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {location || "—"}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={formatDateTime(registration.createdAt)}
                  >
                    {timeAgo(registration.createdAt)}
                  </TableCell>
                  <TableCell>
                    <RegistrationStatusChip status={registration.status} />
                  </TableCell>
                </TableRow>,
                expanded ? (
                  <TableRow
                    key={`${registration.id}-detail`}
                    className="hover:bg-transparent"
                  >
                    <TableCell colSpan={6} className="bg-white/[0.02] align-top">
                      <div className="space-y-5 py-2">
                        <section className="space-y-3">
                          <DetailSection>Dados da empresa</DetailSection>
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <DetailItem label="Razão social">
                              {registration.razaoSocial}
                            </DetailItem>
                            <DetailItem label="Nome fantasia">
                              {registration.nomeFantasia}
                            </DetailItem>
                            <DetailItem
                              label={
                                registration.personType === "pf" ? "CPF" : "CNPJ"
                              }
                            >
                              {registration.cnpj}
                            </DetailItem>
                            <DetailItem label="Cidade/UF">
                              {location}
                            </DetailItem>
                            <DetailItem label="Telefone">
                              {registration.telefone}
                            </DetailItem>
                            <DetailItem label="WhatsApp">
                              {registration.whatsapp}
                            </DetailItem>
                            <DetailItem label="E-mail">
                              {registration.email}
                            </DetailItem>
                            <DetailItem label="Site">
                              {registration.site}
                            </DetailItem>
                          </div>
                          {registration.mensagem && (
                            <div className="space-y-1">
                              <p className="text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">
                                O que precisa
                              </p>
                              <p className="max-w-3xl text-sm whitespace-pre-wrap text-muted-foreground">
                                {registration.mensagem}
                              </p>
                            </div>
                          )}
                        </section>

                        <section className="space-y-3">
                          <DetailSection>Responsável pelo acesso</DetailSection>
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <DetailItem label="Nome">
                              {registration.userName}
                            </DetailItem>
                            <DetailItem label="E-mail">
                              {registration.userEmail}
                            </DetailItem>
                            <DetailItem label="Telefone">
                              {registration.userPhone}
                            </DetailItem>
                            <DetailItem label="Cargo">
                              {registration.userPosition}
                            </DetailItem>
                          </div>
                        </section>

                        {registration.status === "pendente" ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <Button
                              size="sm"
                              onClick={() => setApproving(registration)}
                            >
                              <Check />
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRejecting(registration)}
                            >
                              <X />
                              Recusar
                            </Button>
                          </div>
                        ) : (
                          <section className="space-y-3">
                            <DetailSection>Triagem</DetailSection>
                            <div className="flex flex-wrap items-center gap-3">
                              {registration.status === "aprovado" ? (
                                <>
                                  <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                                    Aprovado — empresa e acesso criados
                                  </p>
                                  {registration.approvedCompanyId && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      render={
                                        <Link
                                          href={`/admin/clientes/${registration.approvedCompanyId}`}
                                        />
                                      }
                                    >
                                      <ExternalLink />
                                      Ver empresa
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <p className="max-w-3xl text-sm whitespace-pre-wrap text-muted-foreground">
                                  <span className="font-medium text-foreground">
                                    Motivo da recusa:{" "}
                                  </span>
                                  {registration.reviewNote ?? "—"}
                                </p>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {registration.reviewerName
                                ? `por ${registration.reviewerName}`
                                : ""}
                              {registration.reviewedAt
                                ? ` em ${formatDate(registration.reviewedAt)}`
                                : ""}
                            </p>
                          </section>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null,
              ];
            })}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => {
          if (!open) setApproving(null);
        }}
        title="Aprovar cadastro"
        description={
          approving
            ? `A empresa "${approving.nomeFantasia || approving.razaoSocial}" será criada ativa e ${approving.userName} (${approving.userEmail}) terá acesso como admin dela, com a senha definida no cadastro.`
            : ""
        }
        confirmLabel="Aprovar cadastro"
        onConfirm={async () => {
          if (!approving) return null;
          const result = await approveRegistration(approving.id);
          return "error" in result ? result.error : null;
        }}
        onSuccess={() => {
          toast.success("Aprovado — empresa e acesso criados.");
          setExpandedId(null);
          router.refresh();
        }}
      />

      {rejecting && (
        <RejectRegistrationDialog
          registration={rejecting}
          open
          onOpenChange={(open) => {
            if (!open) setRejecting(null);
          }}
        />
      )}
    </>
  );
}

function RejectRegistrationDialog({
  registration,
  open,
  onOpenChange,
}: {
  registration: RegistrationListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RejectRegistrationValues>({
    resolver: zodResolver(rejectRegistrationSchema),
    defaultValues: { note: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: RejectRegistrationValues) {
    setError(null);
    const result = await rejectRegistration(registration.id, values.note);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success("Cadastro recusado.");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recusar cadastro</DialogTitle>
          <DialogDescription>
            O cadastro de &quot;
            {registration.nomeFantasia || registration.razaoSocial}&quot; será
            marcado como recusado. Nenhum usuário ou empresa será criado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="note">Motivo da recusa *</Label>
            <Textarea
              id="note"
              rows={4}
              placeholder="Ex.: dados incompletos, empresa fora do perfil atendido..."
              aria-invalid={!!errors.note}
              {...form.register("note")}
            />
            {errors.note && (
              <p className="text-xs text-destructive">{errors.note.message}</p>
            )}
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
            <Button
              type="submit"
              variant="destructive"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="animate-spin" />}
              Recusar cadastro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
