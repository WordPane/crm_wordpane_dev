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
import type { StatusInfo } from "@/lib/queries/projects";
import { cn } from "@/lib/utils";
import {
  emptyProjectValues,
  priorityLabels,
  priorities,
  projectFormSchema,
  projectTypeLabels,
  projectTypes,
  type ProjectFormValues,
} from "@/lib/validations/project";
import { createProject, updateProject } from "@/server/actions/projects";

type SelectOption = { id: string; name: string };

type ProjectFormProps =
  | {
      mode: "create";
      companies: SelectOption[];
      statuses: StatusInfo[];
      teamUsers: SelectOption[];
      defaultCompanyId?: string;
    }
  | {
      mode: "edit";
      projectId: string;
      companies: SelectOption[];
      statuses: StatusInfo[];
      teamUsers: SelectOption[];
      defaultValues: ProjectFormValues;
    };

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

const NONE = "__none__";

export function ProjectForm(props: ProjectFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : {
            ...emptyProjectValues,
            companyId: props.defaultCompanyId ?? "",
            statusId: props.statuses[0]?.id ?? "",
          },
  });
  const { errors } = form.formState;

  function onSubmit(values: ProjectFormValues) {
    setError(null);
    startTransition(async () => {
      const result =
        props.mode === "edit"
          ? await updateProject(props.projectId, values)
          : await createProject(values);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      if (props.mode === "create") {
        toast.success("Projeto criado com sucesso.");
        router.push(
          result.id ? `/admin/projetos/${result.id}` : "/admin/projetos",
        );
      } else {
        toast.success("Projeto atualizado.");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nome do projeto *"
          htmlFor="pf-name"
          error={errors.name?.message}
          className="sm:col-span-2"
        >
          <Input
            id="pf-name"
            placeholder="Ex.: Novo site institucional"
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
        </Field>

        <Field label="Empresa *" error={errors.companyId?.message}>
          <Controller
            control={form.control}
            name="companyId"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger className="w-full" aria-invalid={!!errors.companyId}>
                  <SelectValue placeholder="Selecione a empresa">
                    {(value: string | null) =>
                      !value
                        ? "Selecione a empresa"
                        : (props.companies.find((c) => c.id === value)?.name ??
                          "Selecione a empresa")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {props.companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field label="Tipo *" error={errors.type?.message}>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione">
                    {(value: string | null) => {
                      if (!value) return "Selecione";
                      const t = projectTypes.find((t) => t === value);
                      return t ? projectTypeLabels[t] : "Selecione";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projectTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {projectTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field label="Status" error={errors.statusId?.message}>
          <Controller
            control={form.control}
            name="statusId"
            render={({ field }) => (
              <Select
                value={field.value || NONE}
                onValueChange={(value) =>
                  field.onChange(value === NONE ? "" : value)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione">
                    {(value: string | null) =>
                      !value || value === NONE
                        ? "Sem status"
                        : (props.statuses.find((s) => s.id === value)?.name ??
                          "Selecione")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem status</SelectItem>
                  {props.statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field label="Responsável" error={errors.ownerId?.message}>
          <Controller
            control={form.control}
            name="ownerId"
            render={({ field }) => (
              <Select
                value={field.value || NONE}
                onValueChange={(value) =>
                  field.onChange(value === NONE ? "" : value)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione">
                    {(value: string | null) =>
                      !value || value === NONE
                        ? "Sem responsável"
                        : (props.teamUsers.find((u) => u.id === value)?.name ??
                          "Selecione")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {props.teamUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field label="Data de início" htmlFor="pf-start" error={errors.startDate?.message}>
          <Input id="pf-start" type="date" {...form.register("startDate")} />
        </Field>

        <Field label="Prazo" htmlFor="pf-due" error={errors.dueDate?.message}>
          <Input id="pf-due" type="date" {...form.register("dueDate")} />
        </Field>

        <Field label="Prioridade" error={errors.priority?.message}>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione">
                    {(value: string | null) => {
                      if (!value) return "Selecione";
                      const p = priorities.find((p) => p === value);
                      return p ? priorityLabels[p] : "Selecione";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityLabels[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      </div>

      <Field label="Descrição" error={errors.description?.message}>
        <Textarea
          placeholder="Escopo, objetivos e observações do projeto..."
          rows={5}
          {...form.register("description")}
        />
      </Field>

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
          {props.mode === "edit" ? "Salvar alterações" : "Criar projeto"}
        </Button>
      </div>
    </form>
  );
}
