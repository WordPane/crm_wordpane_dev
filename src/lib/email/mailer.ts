import nodemailer, { type Transporter } from "nodemailer";

import {
  getEmailSettings,
  type EmailSettings,
} from "@/lib/email/settings";
import {
  renderEmailTemplate,
  renderPlainTextFallback,
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
 * Envia e-mail transacional com o template WordPane.
 * NUNCA lança exceção: falhas viram `{ ok: false, error }` + console.error.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    const settings = await getEmailSettings();
    if (!settings) {
      console.warn(`E-mail para ${input.to} não enviado: SMTP não configurado.`);
      return { ok: false, error: "SMTP não configurado." };
    }

    const transporter = createTransporter(settings);
    await transporter.sendMail({
      from: `"${settings.fromName.replace(/"/g, "")}" <${settings.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      html: renderEmailTemplate({
        appUrl: settings.appUrl,
        title: input.title,
        intro: input.intro,
        rows: input.rows,
        cta: input.cta,
      }),
      text: renderPlainTextFallback({
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
