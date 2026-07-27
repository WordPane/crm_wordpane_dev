/**
 * Envia e-mails de TESTE (cobrança PIX, boleto, cartão e NF autorizada)
 * para conferir o layout novo no cliente de e-mail. Não cria cobrança no
 * Asaas nem emite nota fiscal — apenas renderiza e envia com dados fictícios.
 *
 * Uso:  npx tsx scripts/test-emails.ts [destinatario]
 * Destinatário padrão: sidney@wordpane.dev
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local opcional se as variáveis já estiverem no ambiente
}

import { sendEmail, type SendEmailInput } from "../src/lib/email/mailer";
import { getEmailSettings } from "../src/lib/email/settings";

const TO = process.argv[2] ?? "sidney@wordpane.dev";

// Payload PIX copia-e-cola FICTÍCIO (formato EMV/BR Code), só para layout
const FAKE_PIX_PAYLOAD =
  "00020126580014br.gov.bcb.pix013612345678-90ab-cdef-0123-456789abcdef52040000530398654041.005802BR5925WORDPANE ADMINISTRACAO DE S6009Sao Paulo62070503***6304A1B2";

/** Gera um QR real (PNG → base64) para o payload fictício — só visualização. */
async function fetchQrBase64(data: string): Promise<string | null> {
  try {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&qzone=2&data=${encodeURIComponent(data)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer()).toString("base64");
  } catch (error) {
    console.warn("QR de teste não pôde ser gerado (e-mail sai sem imagem):", error);
    return null;
  }
}

async function main() {
  console.log(`\n📨 Enviando e-mails de teste para ${TO} (nada é emitido no Asaas)...\n`);

  const settings = await getEmailSettings();
  if (!settings) {
    console.error("SMTP não configurado — defina em Admin → Configurações.");
    process.exit(1);
  }
  const appUrl = settings.appUrl;
  const asaas = "https://sandbox.asaas.com";
  const portal = { label: "Acompanhar no portal", url: `${appUrl}/portal/financeiro` };
  const qrBase64 = await fetchQrBase64(FAKE_PIX_PAYLOAD);

  const emails: { label: string; input: SendEmailInput }[] = [
    {
      label: "Cobrança PIX",
      input: {
        to: TO,
        subject: "[TESTE] Nova cobrança: Hospedagem + manutenção — 07/2026",
        title: "Nova cobrança: Hospedagem + manutenção — 07/2026",
        intro:
          "Uma cobrança no valor de R$ 497,00 com vencimento em 30/07/2026 foi gerada para a sua empresa. Pague agora escaneando o QR Code abaixo, ou abra a cobrança no Asaas pelo botão.",
        rows: [
          { label: "Descrição", value: "Hospedagem + manutenção — 07/2026" },
          { label: "Valor", value: "R$ 497,00" },
          { label: "Vencimento", value: "30/07/2026" },
          { label: "Forma de pagamento", value: "PIX" },
        ],
        cta: { label: "Abrir cobrança no Asaas", url: `${asaas}/i/pay_teste_pix` },
        links: [portal],
        qrCode: qrBase64
          ? {
              imageBase64: qrBase64,
              payload: FAKE_PIX_PAYLOAD,
              note: "QR válido até 30/07/2026 às 23:59. Depois do pagamento, a confirmação chega em instantes.",
            }
          : undefined,
      },
    },
    {
      label: "Cobrança boleto",
      input: {
        to: TO,
        subject: "[TESTE] Nova cobrança: Projeto site institucional — parcela 1/2",
        title: "Nova cobrança: Projeto site institucional — parcela 1/2",
        intro:
          "Uma cobrança no valor de R$ 3.250,00 com vencimento em 05/08/2026 foi gerada para a sua empresa. O boleto já está disponível para download — pague pelo link abaixo ou abra a cobrança no Asaas.",
        rows: [
          { label: "Descrição", value: "Projeto site institucional — parcela 1/2" },
          { label: "Valor", value: "R$ 3.250,00" },
          { label: "Vencimento", value: "05/08/2026" },
          { label: "Forma de pagamento", value: "Boleto bancário" },
        ],
        cta: { label: "Abrir cobrança no Asaas", url: `${asaas}/i/pay_teste_boleto` },
        links: [
          { label: "Baixar boleto em PDF", url: `${asaas}/b/pdf/teste_boleto` },
          portal,
        ],
      },
    },
    {
      label: "Cobrança cartão",
      input: {
        to: TO,
        subject: "[TESTE] Nova cobrança: Plano de manutenção — 08/2026",
        title: "Nova cobrança: Plano de manutenção — 08/2026",
        intro:
          "Uma cobrança no valor de R$ 297,00 com vencimento em 10/08/2026 foi gerada para a sua empresa. Pague com cartão de crédito pelo link abaixo.",
        rows: [
          { label: "Descrição", value: "Plano de manutenção — 08/2026" },
          { label: "Valor", value: "R$ 297,00" },
          { label: "Vencimento", value: "10/08/2026" },
          { label: "Forma de pagamento", value: "Cartão de crédito" },
        ],
        cta: { label: "Pagar com cartão", url: `${asaas}/i/pay_teste_cartao` },
        links: [portal],
      },
    },
    {
      label: "Nota fiscal autorizada",
      input: {
        to: TO,
        subject: "[TESTE] Nota fiscal disponível: Hospedagem + manutenção — 07/2026",
        title: "Nota fiscal disponível: Hospedagem + manutenção — 07/2026",
        intro:
          "A nota fiscal nº 1234 de R$ 497,00 já está disponível. Baixe o PDF ou o XML diretamente pelos links abaixo — eles também ficam guardados no seu portal.",
        rows: [
          { label: "Serviço", value: "Hospedagem + manutenção — 07/2026" },
          { label: "Valor", value: "R$ 497,00" },
          { label: "Número da NF", value: "1234" },
        ],
        cta: {
          label: "Baixar nota fiscal (PDF)",
          url: `${asaas}/invoices/teste_nf/pdf`,
        },
        links: [
          { label: "Baixar XML da nota", url: `${asaas}/invoices/teste_nf/xml` },
          { label: "Ver no portal", url: `${appUrl}/portal/financeiro` },
        ],
      },
    },
  ];

  let failures = 0;
  for (const { label, input } of emails) {
    const result = await sendEmail(input);
    if (result.ok) {
      console.log(`✓ ${label} — enviado`);
    } else {
      failures += 1;
      console.error(`✗ ${label} — falhou: ${result.error}`);
    }
  }

  console.log(
    failures === 0
      ? `\nTodos os ${emails.length} e-mails de teste foram enviados para ${TO}.`
      : `\n${failures} de ${emails.length} envios falharam.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Falha inesperada no envio de teste:", error);
  process.exit(1);
});
