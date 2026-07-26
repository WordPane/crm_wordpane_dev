import { randomBytes } from "node:crypto";

/**
 * Cliente mínimo da API do Enhance (painel de hospedagem).
 * Docs: https://apidocs.enhance.com — auth: header `Authorization: Bearer`.
 * A API é servida pelo próprio painel: {ENHANCE_PANEL_URL}/api/orgs/{orgId}/...
 * Configuração via envs (sem elas, a automação simplesmente pula a etapa).
 */

export class EnhanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnhanceError";
  }
}

type EnhanceSettings = {
  panelUrl: string;
  orgId: string;
  token: string;
};

export function getEnhanceSettings(): EnhanceSettings | null {
  const panelUrl = process.env.ENHANCE_PANEL_URL?.replace(/\/+$/, "");
  const orgId = process.env.ENHANCE_ORG_ID;
  const token = process.env.ENHANCE_API_TOKEN;
  if (!panelUrl || !orgId || !token) return null;
  return { panelUrl, orgId, token };
}

export function isEnhanceConfigured(): boolean {
  return getEnhanceSettings() !== null;
}

async function request<T>(
  settings: EnhanceSettings,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `${settings.panelUrl}/api/orgs/${settings.orgId}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": "application/json",
        "User-Agent": "wordpane-crm",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    },
  );

  if (response.status === 204) return undefined as T;

  const data = (await response.json().catch(() => null)) as {
    message?: string;
    errors?: { description?: string }[];
  } | null;

  if (!response.ok) {
    const description = data?.errors?.[0]?.description ?? data?.message;
    throw new EnhanceError(
      description ?? `Erro ${response.status} ao chamar a API do Enhance.`,
    );
  }
  return data as T;
}

/** Sufixo de domínio temporário/staging configurado no painel. */
async function getStagingDomain(settings: EnhanceSettings): Promise<string> {
  const data = await request<{ domain?: string }>(
    settings,
    "GET",
    "/staging-domain",
  );
  if (!data?.domain) {
    throw new EnhanceError(
      "Domínio temporário (staging domain) não configurado no painel.",
    );
  }
  return data.domain;
}

/** Slug aleatório com prefixo que identifica os sites criados pelo CRM. */
function randomSlug(): string {
  return `wp-${randomBytes(5).toString("hex")}`;
}

/**
 * Cria um site no domínio temporário do painel ("<slug>.<staging-domain>")
 * e retorna o domínio completo e a URL https. Usado na automação de
 * orçamento aprovado — o cliente acompanha o desenvolvimento pelo link.
 */
export async function createTemporarySite(): Promise<{
  domain: string;
  url: string;
}> {
  const settings = getEnhanceSettings();
  if (!settings) {
    throw new EnhanceError("Enhance não configurado (envs ausentes).");
  }
  const suffix = await getStagingDomain(settings);
  const domain = `${randomSlug()}.${suffix}`;
  await request<{ id: string }>(settings, "POST", "/websites", { domain });
  return { domain, url: `https://${domain}` };
}
