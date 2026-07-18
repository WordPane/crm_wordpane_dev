"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { maskCep, maskCnpj, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  companyFormSchema,
  emptyCompanyValues,
  type CompanyFormValues,
} from "@/lib/validations/company";
import { createCompany, updateCompany } from "@/server/actions/companies";

type CompanyFormProps =
  | { mode: "create" }
  | { mode: "edit"; companyId: string; defaultValues: CompanyFormValues };

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

export function CompanyForm(props: CompanyFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues:
      props.mode === "edit" ? props.defaultValues : emptyCompanyValues,
  });
  const { errors } = form.formState;

  function onSubmit(values: CompanyFormValues) {
    setError(null);
    startTransition(async () => {
      const result =
        props.mode === "edit"
          ? await updateCompany(props.companyId, values)
          : await createCompany(values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      if (props.mode === "create") {
        toast.success("Cliente criado com sucesso.");
        router.push(
          result.id ? `/admin/clientes/${result.id}` : "/admin/clientes",
        );
      } else {
        toast.success("Dados atualizados.");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* ─── Identificação ─── */}
      <section className="space-y-4">
        <SectionTitle>Identificação</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Razão social *"
            htmlFor="razaoSocial"
            error={errors.razaoSocial?.message}
          >
            <Input
              id="razaoSocial"
              placeholder="Empresa LTDA"
              aria-invalid={!!errors.razaoSocial}
              {...form.register("razaoSocial")}
            />
          </Field>
          <Field
            label="Nome fantasia"
            htmlFor="nomeFantasia"
            error={errors.nomeFantasia?.message}
          >
            <Input
              id="nomeFantasia"
              placeholder="Nome de fachada"
              {...form.register("nomeFantasia")}
            />
          </Field>
          <Field label="CNPJ" htmlFor="cnpj" error={errors.cnpj?.message}>
            <Controller
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                  aria-invalid={!!errors.cnpj}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(maskCnpj(e.target.value))}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              )}
            />
          </Field>
          <Field
            label="Inscrição estadual"
            htmlFor="inscricaoEstadual"
            error={errors.inscricaoEstadual?.message}
          >
            <Input
              id="inscricaoEstadual"
              placeholder="000.000.000.000"
              {...form.register("inscricaoEstadual")}
            />
          </Field>
          <Field label="Status" error={errors.status?.message}>
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
                        value === "ativo"
                          ? "Ativo"
                          : value === "inativo"
                            ? "Inativo"
                            : value === "prospect"
                              ? "Prospect"
                              : "Selecione"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
      </section>

      {/* ─── Endereço ─── */}
      <section className="space-y-4">
        <SectionTitle>Endereço</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Logradouro"
            htmlFor="logradouro"
            className="sm:col-span-2"
            error={errors.logradouro?.message}
          >
            <Input
              id="logradouro"
              placeholder="Av. Paulista"
              {...form.register("logradouro")}
            />
          </Field>
          <Field label="Número" htmlFor="numero" error={errors.numero?.message}>
            <Input id="numero" placeholder="1000" {...form.register("numero")} />
          </Field>
          <Field
            label="Complemento"
            htmlFor="complemento"
            error={errors.complemento?.message}
          >
            <Input
              id="complemento"
              placeholder="Sala 42"
              {...form.register("complemento")}
            />
          </Field>
          <Field
            label="Bairro"
            htmlFor="bairro"
            className="sm:col-span-2 lg:col-span-1"
            error={errors.bairro?.message}
          >
            <Input
              id="bairro"
              placeholder="Bela Vista"
              {...form.register("bairro")}
            />
          </Field>
          <Field label="Cidade" htmlFor="cidade" error={errors.cidade?.message}>
            <Input
              id="cidade"
              placeholder="São Paulo"
              {...form.register("cidade")}
            />
          </Field>
          <Field label="UF" htmlFor="estado" error={errors.estado?.message}>
            <Controller
              control={form.control}
              name="estado"
              render={({ field }) => (
                <Input
                  id="estado"
                  placeholder="SP"
                  maxLength={2}
                  className="uppercase"
                  aria-invalid={!!errors.estado}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value.toUpperCase())
                  }
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              )}
            />
          </Field>
          <Field label="CEP" htmlFor="cep" error={errors.cep?.message}>
            <Controller
              control={form.control}
              name="cep"
              render={({ field }) => (
                <Input
                  id="cep"
                  placeholder="00000-000"
                  inputMode="numeric"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(maskCep(e.target.value))}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              )}
            />
          </Field>
          <Field label="País *" htmlFor="pais" error={errors.pais?.message}>
            <Input id="pais" {...form.register("pais")} />
          </Field>
        </div>
      </section>

      {/* ─── Contato ─── */}
      <section className="space-y-4">
        <SectionTitle>Contato</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Telefone"
            htmlFor="telefone"
            error={errors.telefone?.message}
          >
            <Controller
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <Input
                  id="telefone"
                  placeholder="(00) 0000-0000"
                  inputMode="numeric"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(maskPhone(e.target.value))}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              )}
            />
          </Field>
          <Field
            label="WhatsApp"
            htmlFor="whatsapp"
            error={errors.whatsapp?.message}
          >
            <Controller
              control={form.control}
              name="whatsapp"
              render={({ field }) => (
                <Input
                  id="whatsapp"
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
          </Field>
          <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              placeholder="contato@empresa.com"
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
          </Field>
          <Field label="Site" htmlFor="site" error={errors.site?.message}>
            <Input
              id="site"
              placeholder="https://empresa.com"
              {...form.register("site")}
            />
          </Field>
        </div>
      </section>

      {/* ─── Observações ─── */}
      <section className="space-y-4">
        <SectionTitle>Observações</SectionTitle>
        <Field label="Anotações internas" error={errors.observacoes?.message}>
          <Textarea
            placeholder="Detalhes relevantes sobre o cliente..."
            rows={4}
            {...form.register("observacoes")}
          />
        </Field>
      </section>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.back()}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {props.mode === "edit" ? "Salvar alterações" : "Criar cliente"}
        </Button>
      </div>
    </form>
  );
}
