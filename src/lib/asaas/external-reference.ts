/**
 * Referência própria do CRM em cobranças e assinaturas no Asaas:
 * `externalReference = "CRM-<id local>"` — mesmo padrão que outros
 * sistemas da conta usam (ex.: "MPAY-..."), para identificação inequívoca
 * do que é nosso.
 */
export const CRM_REF_PREFIX = "CRM-";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca um id local como externalReference no Asaas. */
export function toCrmReference(localId: string): string {
  return `${CRM_REF_PREFIX}${localId}`;
}

/**
 * Extrai o id da charge local de um externalReference vindo do Asaas.
 * Aceita "CRM-<uuid>" (formato novo) e "<uuid>" puro (cobranças criadas
 * antes do prefixo). Qualquer outro formato — de outro sistema que
 * compartilha a conta Asaas — retorna null: o chamador NUNCA deve
 * consultar `charges.id` com um valor não-UUID, porque o cast do
 * Postgres lança erro e derruba o webhook com 500.
 */
export function chargeIdFromReference(
  externalReference: string | null | undefined,
): string | null {
  if (!externalReference) return null;
  const raw = externalReference.startsWith(CRM_REF_PREFIX)
    ? externalReference.slice(CRM_REF_PREFIX.length)
    : externalReference;
  return UUID_REGEX.test(raw) ? raw : null;
}
