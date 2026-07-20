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
  // O drizzle embrulha o erro do pg: o código real pode estar em .cause
  const hasCode = (e: unknown): boolean =>
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505";
  if (hasCode(error)) return true;
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  return hasCode(cause);
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
  // Loga a causa real (o drizzle embrulha o erro do pg em .cause)
  console.error(error instanceof Error ? (error.cause ?? error) : error);
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
