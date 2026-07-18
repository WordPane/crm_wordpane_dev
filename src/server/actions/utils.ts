import { ZodError } from "zod";

import { ForbiddenError } from "@/lib/access/permissions";

export type ActionResult = { success: true; id?: string } | { error: string };

type ActionErrorOptions = {
  /** Mensagem para violação de unicidade (e-mail/CNPJ já cadastrado). */
  uniqueMessage?: string;
  /** Mensagem genérica para erros inesperados. */
  fallback?: string;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/** Converte exceções em { error } amigável — nunca deixe exceção vazar para o cliente. */
export function actionError(
  error: unknown,
  options: ActionErrorOptions = {},
): { error: string } {
  if (error instanceof ForbiddenError) return { error: error.message };
  if (error instanceof ZodError) {
    return { error: error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (isUniqueViolation(error)) {
    return {
      error:
        options.uniqueMessage ??
        "Já existe um registro cadastrado com este dado.",
    };
  }
  console.error(error);
  return {
    error:
      options.fallback ??
      "Não foi possível concluir a operação. Tente novamente.",
  };
}

/** Converte string vazia/blank em null (campos opcionais do banco). */
export function nullIfEmpty(value: string | undefined | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Normaliza e-mail para comparação/armazenamento. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
