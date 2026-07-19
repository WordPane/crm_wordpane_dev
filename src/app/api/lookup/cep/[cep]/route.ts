import { NextResponse } from "next/server";

/**
 * GET /api/lookup/cep/[cep] — endereço do CEP via ViaCEP.
 * Proxy server-side (evita CORS) de dado público; usado no cadastro.
 * Docs: https://viacep.com.br
 */

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cep: string }> },
) {
  const { cep } = await params;
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) {
    return NextResponse.json({ error: "CEP inválido." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://viacep.com.br/ws/${digits}/json/`,
      { next: { revalidate: 86400 } },
    );
    if (!response.ok) {
      return NextResponse.json(
        { error: "Consulta indisponível no momento. Tente novamente." },
        { status: 502 },
      );
    }

    const data = (await response.json()) as ViaCepResponse;
    if (data.erro) {
      return NextResponse.json(
        { error: "CEP não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      cep: data.cep ?? "",
      logradouro: data.logradouro ?? "",
      complemento: data.complemento ?? "",
      bairro: data.bairro ?? "",
      cidade: data.localidade ?? "",
      estado: data.uf ?? "",
    });
  } catch (error) {
    console.error("Falha ao consultar CEP:", error);
    return NextResponse.json(
      { error: "Consulta indisponível no momento. Tente novamente." },
      { status: 502 },
    );
  }
}
