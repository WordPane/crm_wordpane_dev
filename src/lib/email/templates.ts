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

export type EmailTemplateInput = {
  /** URL pública do app (base do logo e dos CTAs relativos já resolvidos pelo chamador). */
  appUrl: string;
  brand: EmailTemplateBrand;
  title: string;
  intro: string;
  rows?: EmailTemplateRow[];
  cta?: EmailTemplateCta;
  footerNote?: string;
};

const FONT = "'Inter', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** URLs só entram em href/src depois de sanitizadas (http/https ou /). */
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:\/\/|\/)/i.test(trimmed)) return escapeHtml(trimmed);
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

export function renderEmailTemplate(input: EmailTemplateInput): string {
  const { brand, title, intro, rows, cta, footerNote } = input;

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
            <td style="padding:0 8px 24px;">
              <img src="${safeUrl(brand.logoUrl)}" width="140" alt="${escapeHtml(brand.appName)}" style="display:block;width:140px;height:auto;" />
            </td>
          </tr>

          <tr>
            <td style="background-color:${brand.cardColor};border:1px solid rgba(255,255,255,0.09);border-radius:16px;padding:32px;">
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">${escapeHtml(title)}</h1>
              <p style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:1.6;color:rgba(255,255,255,0.72);">${escapeHtml(intro)}</p>
              ${rows && rows.length > 0 ? renderRows(rows) : ""}
              ${cta ? renderCta(cta, brand) : ""}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#52708a;">
              ${escapeHtml(brand.appName)} — Gestão de clientes e projetos
              ${footerNote ? `<br />${escapeHtml(footerNote)}` : ""}
            </td>
          </tr>

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

  if (input.cta) lines.push(`${input.cta.label}: ${input.cta.url}`, "");

  lines.push("—", `${input.brand.appName} — Gestão de clientes e projetos`);
  if (input.footerNote) lines.push(input.footerNote);

  return lines.join("\n");
}
