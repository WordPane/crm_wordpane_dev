"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { maskCnpj, maskPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  emptyRegistrationValues,
  registrationFormSchema,
  type RegistrationFormValues,
} from "@/lib/validations/registration";
import { submitRegistration } from "@/server/actions/registrations";

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

/** Card do cadastro público — vira tela de confirmação após o envio. */
export function RegistrationCard() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: emptyRegistrationValues,
  });
  const { errors } = form.formState;

  function onSubmit(values: RegistrationFormValues) {
    setError(null);
    startTransition(async () => {
      const result = await submitRegistration(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CircleCheck className="size-12 text-[#00d164]" />
        <h1 className="text-lg font-bold">Cadastro recebido!</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Nossa equipe vai analisar e ativar seu acesso em breve. Quando estiver
          tudo pronto, você poderá entrar com o e-mail e a senha informados.
        </p>
        <Button
          variant="outline"
          render={<Link href="/login" />}
          className="mt-2"
        >
          Voltar para o login
        </Button>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-center text-lg font-bold">
        Cadastre sua empresa
      </h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Preencha os dados abaixo. Nossa equipe analisa cada cadastro e ativa o
        acesso manualmente.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Honeypot anti-bot: escondido de humanos, bots preenchem */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <Label htmlFor="empresa">Empresa</Label>
          <Input
            id="empresa"
            tabIndex={-1}
            autoComplete="off"
            {...form.register("empresa")}
          />
        </div>

        {/* ─── Dados da empresa ─── */}
        <section className="space-y-4">
          <SectionTitle>Dados da empresa</SectionTitle>
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
            <div className="grid grid-cols-[1fr_5rem] gap-4">
              <Field
                label="Cidade"
                htmlFor="cidade"
                error={errors.cidade?.message}
              >
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
            </div>
          </div>
        </section>

        {/* ─── Seu acesso ─── */}
        <section className="space-y-4">
          <SectionTitle>Seu acesso</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Seu nome *"
              htmlFor="userName"
              error={errors.userName?.message}
            >
              <Input
                id="userName"
                autoComplete="name"
                placeholder="Maria Souza"
                aria-invalid={!!errors.userName}
                {...form.register("userName")}
              />
            </Field>
            <Field
              label="Seu e-mail *"
              htmlFor="userEmail"
              error={errors.userEmail?.message}
            >
              <Input
                id="userEmail"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com"
                aria-invalid={!!errors.userEmail}
                {...form.register("userEmail")}
              />
            </Field>
            <Field
              label="Senha *"
              htmlFor="userPassword"
              error={errors.userPassword?.message}
            >
              <Input
                id="userPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo de 6 caracteres"
                aria-invalid={!!errors.userPassword}
                {...form.register("userPassword")}
              />
            </Field>
            <Field
              label="Confirmar senha *"
              htmlFor="userPasswordConfirm"
              error={errors.userPasswordConfirm?.message}
            >
              <Input
                id="userPasswordConfirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                aria-invalid={!!errors.userPasswordConfirm}
                {...form.register("userPasswordConfirm")}
              />
            </Field>
            <Field
              label="Seu telefone"
              htmlFor="userPhone"
              error={errors.userPhone?.message}
            >
              <Controller
                control={form.control}
                name="userPhone"
                render={({ field }) => (
                  <Input
                    id="userPhone"
                    placeholder="(00) 00000-0000"
                    inputMode="numeric"
                    autoComplete="tel"
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
              label="Cargo"
              htmlFor="userPosition"
              error={errors.userPosition?.message}
            >
              <Input
                id="userPosition"
                placeholder="Diretoria"
                {...form.register("userPosition")}
              />
            </Field>
          </div>
        </section>

        {/* ─── Mensagem ─── */}
        <section className="space-y-4">
          <Field
            label="Conte rapidamente o que você precisa"
            htmlFor="mensagem"
            error={errors.mensagem?.message}
          >
            <Textarea
              id="mensagem"
              placeholder="Ex.: preciso de um site institucional e de um portal para meus clientes..."
              rows={4}
              {...form.register("mensagem")}
            />
          </Field>
        </section>

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Enviando..." : "Enviar cadastro"}
        </Button>
      </form>
    </>
  );
}
