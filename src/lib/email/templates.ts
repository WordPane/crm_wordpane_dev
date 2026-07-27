/**
 * Template de e-mail transacional (white-label).
 * Compatibilidade com clientes de e-mail: layout em tabelas, largura 600px,
 * TODO o CSS inline (apenas resets mínimos em <style>) e CTA em <a> estilizado
 * com fallback de cor sólida para clientes sem suporte a gradiente (Outlook).
 */

export type EmailTemplateRow = { label: string; value: string };
export type EmailTemplateCta = { label: string; url: string };

export type EmailTemplateBrand = {
  appName: string;
  /** URL absoluta da logo. */
  logoUrl: string;
  primaryColor: string;
  /** Tom mais escuro da primária (gradiente do CTA). */
  primaryAltColor: string;
  backgroundColor: string;
  /** Cor do cartão de conteúdo. */
  cardColor: string;
};

/**
 * Bloco PIX do e-mail: QR Code (anexo referenciado via CID) + copia-e-cola.
 * A imagem NÃO vai em base64 no <img> — Gmail/Outlook bloqueiam data URIs.
 */
export type EmailTemplateQrCode = {
  /** Código PIX copia-e-cola. */
  payload: string;
  /** Observação abaixo do código (ex.: validade do QR). */
  note?: string;
};

/** CID do anexo com o PNG do QR Code (templates.ts ↔ mailer.ts). */
export const PIX_QR_CID = "pix-qrcode";

/** Rodapé profissional: marca + links (CRM, site) + dados do emissor. */
export type EmailTemplateFooter = {
  /** URL pública do CRM (portal do cliente). */
  portalUrl: string;
  /** Site principal da marca. */
  websiteUrl: string;
  /** Nome de exibição da empresa (emissor). */
  companyName: string;
  /** Razão social + CNPJ em uma linha. */
  legalLine?: string;
  addressLine?: string;
  supportEmail?: string;
  phone?: string;
};

export type EmailTemplateInput = {
  /** URL pública do app (base do logo e dos CTAs relativos já resolvidos pelo chamador). */
  appUrl: string;
  brand: EmailTemplateBrand;
  title: string;
  intro: string;
  rows?: EmailTemplateRow[];
  cta?: EmailTemplateCta;
  /** Links secundários em texto, abaixo do CTA (ex.: baixar boleto/XML). */
  links?: EmailTemplateCta[];
  qrCode?: EmailTemplateQrCode;
  footer: EmailTemplateFooter;
  footerNote?: string;
};

const FONT = "'Inter', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URLs só entram em href/src depois de sanitizadas (http/https, mailto ou /). */
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:|\/|cid:)/i.test(trimmed)) return escapeHtml(trimmed);
  return "#";
}

function renderRows(rows: EmailTemplateRow[]): string {
  const body = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.09);font-family:${FONT};font-size:13px;line-height:1.5;color:rgba(255,255,255,0.5);">${escapeHtml(row.label)}</td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.09);font-family:${FONT};font-size:14px;line-height:1.5;color:#ffffff;">${escapeHtml(row.value)}</td>
        </tr>`,
    )
    .join("");

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-top:1px solid rgba(255,255,255,0.09);">
        ${body}
      </table>`;
}

function renderCta(cta: EmailTemplateCta, brand: EmailTemplateBrand): string {
  return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
        <tr>
          <td align="center" style="border-radius:999px;background-color:${brand.primaryColor};background-image:linear-gradient(120deg,${brand.primaryColor},${brand.primaryAltColor});">
            <a href="${safeUrl(cta.url)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:${brand.backgroundColor};text-decoration:none;border-radius:999px;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>
      </table>`;
}

/** Bloco PIX em cartão branco: QR escaneável em qualquer fundo. */
function renderQrCode(qrCode: EmailTemplateQrCode): string {
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:#ffffff;border-radius:12px;">
        <tr>
          <td align="center" style="padding:24px 20px;">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:14px;font-weight:700;line-height:1.4;color:#0f172a;">Pague com PIX</p>
            <p style="margin:0 0 16px;font-family:${FONT};font-size:12px;line-height:1.5;color:#64748b;">Aponte a câmera do celular ou abra o app do seu banco</p>
            <img src="cid:${PIX_QR_CID}" width="180" height="180" alt="QR Code PIX" style="display:block;width:180px;height:180px;margin:0 auto 16px;" />
            <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:600;line-height:1.5;color:#334155;">Ou copie o código PIX:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#f1f5f9;border-radius:8px;padding:10px 12px;">
                  <p style="margin:0;font-family:${MONO};font-size:11px;line-height:1.6;color:#475569;word-break:break-all;">${escapeHtml(qrCode.payload)}</p>
                </td>
              </tr>
            </table>
            ${qrCode.note ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:11px;line-height:1.5;color:#94a3b8;">${escapeHtml(qrCode.note)}</p>` : ""}
          </td>
        </tr>
      </table>`;
}

/** Links secundários em texto (downloads alternativos, portal etc.). */
function renderLinks(links: EmailTemplateCta[], brand: EmailTemplateBrand): string {
  const body = links
    .map(
      (link) => `
            <p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.5;">
              <a href="${safeUrl(link.url)}" target="_blank" style="color:${brand.primaryColor};text-decoration:underline;">${escapeHtml(link.label)}</a>
            </p>`,
    )
    .join("");

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;border-top:1px solid rgba(255,255,255,0.09);">
        <tr>
          <td style="padding:16px 0 0;">
            ${body}
          </td>
        </tr>
      </table>`;
}

function renderFooter(
  footer: EmailTemplateFooter,
  brand: EmailTemplateBrand,
  footerNote?: string,
): string {
  const sep = `<span style="color:#52708a;">&nbsp;&middot;&nbsp;</span>`;
  const links = [
    `<a href="${safeUrl(footer.portalUrl)}" target="_blank" style="color:${brand.primaryColor};text-decoration:none;">Portal do cliente</a>`,
    `<a href="${safeUrl(footer.websiteUrl)}" target="_blank" style="color:${brand.primaryColor};text-decoration:none;">Nosso site</a>`,
    footer.supportEmail
      ? `<a href="mailto:${escapeHtml(footer.supportEmail)}" style="color:${brand.primaryColor};text-decoration:none;">Fale conosco</a>`
      : "",
  ]
    .filter(Boolean)
    .join(sep);

  const contact = [footer.phone, footer.supportEmail].filter(Boolean).join(" · ");

  return `
          <tr>
            <td style="padding:28px 8px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(255,255,255,0.09);">
                <tr>
                  <td align="center" style="padding:20px 8px 0;">
                    <p style="margin:0 0 10px;font-family:${FONT};font-size:13px;font-weight:600;line-height:1.5;color:rgba(255,255,255,0.6);">${escapeHtml(brand.appName)} — Gestão de clientes e projetos</p>
                    <p style="margin:0 0 14px;font-family:${FONT};font-size:12px;line-height:1.6;">${links}</p>
                    <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;line-height:1.6;color:#7b93a8;">${escapeHtml(footer.companyName)}${contact ? ` · ${escapeHtml(contact)}` : ""}</p>
                    ${footer.legalLine ? `<p style="margin:0 0 4px;font-family:${FONT};font-size:11px;line-height:1.6;color:#52708a;">${escapeHtml(footer.legalLine)}</p>` : ""}
                    ${footer.addressLine ? `<p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.6;color:#52708a;">${escapeHtml(footer.addressLine)}</p>` : ""}
                    <p style="margin:14px 0 0;font-family:${FONT};font-size:11px;line-height:1.6;color:#52708a;">
                      Este é um e-mail automático enviado por ${escapeHtml(brand.appName)}. Em caso de dúvidas, fale conosco pelos canais acima.
                      ${footerNote ? `<br />${escapeHtml(footerNote)}` : ""}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderEmailTemplate(input: EmailTemplateInput): string {
  const { brand, title, intro, rows, cta, links, qrCode, footer, footerNote } =
    input;

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(title)}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${brand.backgroundColor};">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${brand.backgroundColor};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

          <tr>
            <td align="center" style="padding:0 8px 28px;">
              <img src="${safeUrl(brand.logoUrl)}" width="190" alt="${escapeHtml(brand.appName)}" style="display:block;width:190px;height:auto;margin:0 auto;" />
            </td>
          </tr>

          <tr>
            <td style="background-color:${brand.cardColor};border:1px solid rgba(255,255,255,0.09);border-radius:16px;padding:32px;">
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">${escapeHtml(title)}</h1>
              <p style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:1.6;color:rgba(255,255,255,0.72);">${escapeHtml(intro)}</p>
              ${rows && rows.length > 0 ? renderRows(rows) : ""}
              ${qrCode ? renderQrCode(qrCode) : ""}
              ${cta ? renderCta(cta, brand) : ""}
              ${links && links.length > 0 ? renderLinks(links, brand) : ""}
            </td>
          </tr>

          ${renderFooter(footer, brand, footerNote)}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versão texto puro (campo `text` do nodemailer). */
export function renderPlainTextFallback(
  input: Omit<EmailTemplateInput, "appUrl">,
): string {
  const lines: string[] = [input.title, "", input.intro, ""];

  if (input.rows && input.rows.length > 0) {
    for (const row of input.rows) lines.push(`${row.label}: ${row.value}`);
    lines.push("");
  }

  if (input.qrCode) {
    lines.push("PIX copia e cola:", input.qrCode.payload);
    if (input.qrCode.note) lines.push(input.qrCode.note);
    lines.push("");
  }

  if (input.cta) lines.push(`${input.cta.label}: ${input.cta.url}`, "");

  if (input.links && input.links.length > 0) {
    for (const link of input.links) lines.push(`${link.label}: ${link.url}`);
    lines.push("");
  }

  lines.push("—", `${input.brand.appName} — Gestão de clientes e projetos`);
  lines.push(`Portal do cliente: ${input.footer.portalUrl}`);
  lines.push(`Site: ${input.footer.websiteUrl}`);
  lines.push(input.footer.companyName);
  if (input.footer.legalLine) lines.push(input.footer.legalLine);
  if (input.footer.addressLine) lines.push(input.footer.addressLine);
  if (input.footerNote) lines.push(input.footerNote);

  return lines.join("\n");
}
