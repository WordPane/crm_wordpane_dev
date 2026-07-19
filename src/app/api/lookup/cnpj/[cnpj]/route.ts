import { NextResponse } from "next/server";

/**
 * GET /api/lookup/cnpj/[cnpj] — dados públicos do CNPJ via BrasilAPI.
 * Proxy server-side (evita CORS) de dado público; usado no cadastro.
 * Docs: https://brasilapi.com.br/docs#tag/CNPJ
 */

type BrasilApiCnpj = {
  razao_social?: string;
  nome_fantasia?: string;
  ddd_telefone_1?: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cnpj: string }> },
) {
  const { cnpj } = await params;
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      {
        // BrasilAPI limita requisições sem User-Agent (HTTP 429)
        headers: { "User-Agent": "wordpane-crm/1.0 (hello@wordpane.dev)" },
        next: { revalidate: 86400 }, // dados cadastrais mudam raramente
      },
    );

    if (response.status === 404) {
      return NextResponse.json(
        { error: "CNPJ não encontrado na Receita Federal." },
        { status: 404 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "Consulta indisponível no momento. Tente novamente." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as BrasilApiCnpj;
    return NextResponse.json({
      razaoSocial: data.razao_social ?? "",
      nomeFantasia: data.nome_fantasia ?? "",
      telefone: data.ddd_telefone_1 ?? "",
      email: data.email ?? "",
      cep: data.cep ?? "",
      logradouro: data.logradouro ?? "",
      numero: data.numero ?? "",
      complemento: data.complemento ?? "",
      bairro: data.bairro ?? "",
      cidade: data.municipio ?? "",
      estado: data.uf ?? "",
    });
  } catch (error) {
    console.error("Falha ao consultar CNPJ:", error);
    return NextResponse.json(
      { error: "Consulta indisponível no momento. Tente novamente." },
      { status: 502 },
    );
  }
}
