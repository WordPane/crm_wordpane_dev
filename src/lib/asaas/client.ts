import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { getAsaasSettings, type AsaasSettings } from "@/lib/asaas/settings";

/**
 * Cliente mínimo da API Asaas v3 (fetch, sem SDK).
 * Docs: https://docs.asaas.com (auth: header access_token; User-Agent obrigatório).
 */

export class AsaasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsaasError";
  }
}

const BASE_URLS: Record<AsaasSettings["environment"], string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

async function requireSettings(): Promise<AsaasSettings> {
  const settings = await getAsaasSettings();
  if (!settings || !settings.apiKey) {
    throw new AsaasError(
      "Asaas não configurado. Defina a API key em Admin → Configurações.",
    );
  }
  return settings;
}

async function request<T>(
  settings: AsaasSettings,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${BASE_URLS[settings.environment]}${path}`, {
    method,
    headers: {
      access_token: settings.apiKey,
      "Content-Type": "application/json",
      "User-Agent": "wordpane-crm",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (response.status === 204) return undefined as T;

  const data = (await response.json().catch(() => null)) as {
    errors?: { code?: string; description?: string }[];
  } | null;

  if (!response.ok) {
    const description = data?.errors?.[0]?.description;
    throw new AsaasError(
      description ?? `Erro ${response.status} ao chamar a API do Asaas.`,
    );
  }
  return data as T;
}

// ─────────────────────────── Tipos da API ───────────────────────────

export type AsaasCustomer = { id: string };

export type AsaasPayment = {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
};

export type AsaasSubscription = { id: string };

export type AsaasPixQrCode = {
  encodedImage: string; // PNG em base64
  payload: string; // copia-e-cola
  expirationDate: string;
};

type ListResponse<T> = { data: T[]; totalCount: number };

// billingType local → Asaas
export const asaasBillingType = {
  pix: "PIX",
  boleto: "BOLETO",
  credit_card: "CREDIT_CARD",
  undefined: "UNDEFINED",
} as const;

export type LocalBillingType = keyof typeof asaasBillingType;

// cycle local → Asaas
export const asaasCycle = {
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  semiannually: "SEMIANNUALLY",
  yearly: "YEARLY",
} as const;

export type LocalCycle = keyof typeof asaasCycle;

// ─────────────────────────── Clientes ───────────────────────────

/**
 * Garante que a empresa existe como customer no Asaas e retorna o id.
 * Persiste `companies.asaasCustomerId` para não duplicar (a API não deduplica).
 */
export async function ensureCustomer(companyId: string): Promise<string> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) throw new AsaasError("Empresa não encontrada.");
  if (company.asaasCustomerId) return company.asaasCustomerId;

  const settings = await requireSettings();

  // Reutiliza cliente já existente com o mesmo externalReference
  const existing = await request<ListResponse<AsaasCustomer>>(
    settings,
    "GET",
    `/customers?externalReference=${encodeURIComponent(company.id)}&limit=1`,
  );
  let customerId = existing.data[0]?.id;

  if (!customerId) {
    const cpfCnpj = company.cnpj?.replace(/\D/g, "") || undefined;
    const created = await request<AsaasCustomer>(settings, "POST", "/customers", {
      name: company.nomeFantasia || company.razaoSocial,
      cpfCnpj,
      email: company.email ?? undefined,
      externalReference: company.id,
      notificationDisabled: false,
    });
    customerId = created.id;
  }

  await db
    .update(companies)
    .set({ asaasCustomerId: customerId })
    .where(eq(companies.id, company.id));

  return customerId;
}

// ─────────────────────────── Cobranças ───────────────────────────

export async function createPayment(input: {
  customerId: string;
  billingType: LocalBillingType;
  valueCents: number;
  dueDate: string; // YYYY-MM-DD
  description: string;
  externalReference: string; // charge.id (conciliação no webhook)
}): Promise<AsaasPayment> {
  const settings = await requireSettings();
  return request<AsaasPayment>(settings, "POST", "/payments", {
    customer: input.customerId,
    billingType: asaasBillingType[input.billingType],
    value: input.valueCents / 100,
    dueDate: input.dueDate,
    description: input.description,
    externalReference: input.externalReference,
  });
}

export async function deletePayment(asaasPaymentId: string): Promise<void> {
  const settings = await requireSettings();
  await request(settings, "DELETE", `/payments/${asaasPaymentId}`);
}

export async function getPixQrCode(
  asaasPaymentId: string,
): Promise<AsaasPixQrCode> {
  const settings = await requireSettings();
  return request<AsaasPixQrCode>(
    settings,
    "GET",
    `/payments/${asaasPaymentId}/pixQrCode`,
  );
}

// ─────────────────────────── Assinaturas ───────────────────────────

export async function createSubscription(input: {
  customerId: string;
  billingType: LocalBillingType;
  valueCents: number;
  nextDueDate: string; // YYYY-MM-DD (vencimento da 1ª cobrança)
  cycle: LocalCycle;
  description: string;
  externalReference: string; // companyService.id
}): Promise<AsaasSubscription> {
  const settings = await requireSettings();
  return request<AsaasSubscription>(settings, "POST", "/subscriptions", {
    customer: input.customerId,
    billingType: asaasBillingType[input.billingType],
    value: input.valueCents / 100,
    nextDueDate: input.nextDueDate,
    cycle: asaasCycle[input.cycle],
    description: input.description,
    externalReference: input.externalReference,
  });
}

export async function deleteSubscription(
  asaasSubscriptionId: string,
): Promise<void> {
  const settings = await requireSettings();
  await request(settings, "DELETE", `/subscriptions/${asaasSubscriptionId}`);
}

// ─────────────────────────── Notas fiscais (NFS-e) ───────────────────────────

export type AsaasInvoice = { id: string };

/**
 * Agenda/emite a NFS-e de uma cobrança paga. Se effectiveDate for hoje,
 * o Asaas autoriza em ~15 min e avisa via webhook (INVOICE_AUTHORIZED).
 */
export async function createInvoice(input: {
  paymentId: string;
  description: string;
  valueCents: number;
  effectiveDate: string; // YYYY-MM-DD
  serviceCode: string;
  serviceName: string;
}): Promise<AsaasInvoice> {
  const settings = await requireSettings();
  return request<AsaasInvoice>(settings, "POST", "/invoices", {
    payment: input.paymentId,
    serviceDescription: input.description,
    value: input.valueCents / 100,
    deductions: 0,
    effectiveDate: input.effectiveDate,
    municipalServiceCode: input.serviceCode,
    municipalServiceName: input.serviceName,
    // Simples Nacional: impostos recolhidos via DAS, não na nota
    taxes: {
      retainIss: false,
      iss: 0,
      cofins: 0,
      csll: 0,
      inss: 0,
      ir: 0,
      pis: 0,
    },
  });
}

/** Baixa um arquivo da nota (pdfUrl/xmlUrl do Asaas) para o storage interno. */
export async function downloadInvoiceFile(url: string): Promise<Buffer> {
  let response = await fetch(url, { cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    const settings = await requireSettings();
    response = await fetch(url, {
      headers: {
        access_token: settings.apiKey,
        "User-Agent": "wordpane-crm",
      },
      cache: "no-store",
    });
  }
  if (!response.ok) {
    throw new AsaasError(
      `Falha ao baixar o arquivo da nota fiscal (HTTP ${response.status}).`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

// ─────────────────────────── Teste de conexão ───────────────────────────

/** Valida a API key com uma chamada barata (lista 1 cliente). */
export async function testAsaasConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const settings = await requireSettings();
    await request<ListResponse<AsaasCustomer>>(
      settings,
      "GET",
      "/customers?limit=1",
    );
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida.";
    return { ok: false, error: message };
  }
}
