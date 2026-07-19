import nodemailer, { type Transporter } from "nodemailer";

import { brandAssetUrl } from "@/lib/brand/config";
import { getBranding } from "@/lib/brand/settings";
import { brandEmailColors } from "@/lib/brand/theme";
import {
  getEmailSettings,
  type EmailSettings,
} from "@/lib/email/settings";
import {
  renderEmailTemplate,
  renderPlainTextFallback,
  type EmailTemplateBrand,
  type EmailTemplateCta,
  type EmailTemplateRow,
} from "@/lib/email/templates";

export type SendEmailInput = {
  to: string;
  subject: string;
  title: string;
  intro: string;
  rows?: EmailTemplateRow[];
  cta?: EmailTemplateCta;
};

export type SendEmailResult = { ok: true } | { ok: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createTransporter(settings: EmailSettings): Transporter {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass: settings.password },
  });
}

/**
 * Envia e-mail transacional com o template da marca (white-label).
 * NUNCA lança exceção: falhas viram `{ ok: false, error }` + console.error.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const [settings, brandConfig] = await Promise.all([
      getEmailSettings(),
      getBranding(),
    ]);
    if (!settings) {
      console.warn(`E-mail para ${input.to} não enviado: SMTP não configurado.`);
      return { ok: false, error: "SMTP não configurado." };
    }

    const colors = brandEmailColors(brandConfig);
    const brand: EmailTemplateBrand = {
      appName: brandConfig.appName,
      logoUrl: /^https?:\/\//i.test(brandConfig.logoUrl)
        ? brandConfig.logoUrl
        : `${settings.appUrl}${brandAssetUrl(brandConfig, "logo")}`,
      primaryColor: colors.primary,
      primaryAltColor: colors.primaryAlt,
      backgroundColor: colors.background,
      cardColor: colors.card,
    };

    const transporter = createTransporter(settings);
    await transporter.sendMail({
      from: `"${settings.fromName.replace(/"/g, "")}" <${settings.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      html: renderEmailTemplate({
        appUrl: settings.appUrl,
        brand,
        title: input.title,
        intro: input.intro,
        rows: input.rows,
        cta: input.cta,
      }),
      text: renderPlainTextFallback({
        brand,
        title: input.title,
        intro: input.intro,
        rows: input.rows,
        cta: input.cta,
      }),
    });

    return { ok: true };
  } catch (error) {
    console.error(`Falha ao enviar e-mail para ${input.to}:`, error);
    return { ok: false, error: errorMessage(error) };
  }
}

/** Testa a conexão SMTP (transporter.verify) — usado pelo botão de teste. */
export async function verifySmtpConnection(
  settings?: EmailSettings,
): Promise<SendEmailResult> {
  try {
    const resolved = settings ?? (await getEmailSettings());
    if (!resolved) return { ok: false, error: "SMTP não configurado." };
    await createTransporter(resolved).verify();
    return { ok: true };
  } catch (error) {
    console.error("Falha na verificação SMTP:", error);
    return { ok: false, error: errorMessage(error) };
  }
}
