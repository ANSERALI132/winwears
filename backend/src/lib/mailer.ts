/**
 * Sending email.
 *
 * Off until SMTP_HOST is set, and an unconfigured mailer is an expected state
 * rather than an error — the admin works perfectly well without one, exactly
 * as the assistant does without a key.
 *
 * Messages are plain text. A notification is one line and a link; wrapping
 * that in HTML would buy nothing and would mean escaping values that came
 * from a customer's own message.
 *
 * The password is read once and never logged, never returned by an endpoint,
 * and never included in an error. `describe()` exists so a screen can say
 * whether mail is working without ever seeing the credential.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../env';

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
}

let transporter: Transporter | null = null;

function build(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    /* Implicit TLS on 465, STARTTLS on everything else, unless told
       otherwise. Guessing wrong here is the usual reason mail silently
       fails, so it follows the port rather than a default. */
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
  });

  return transporter;
}

export const mailConfigured = (): boolean => Boolean(env.SMTP_HOST);

/** The from address. Most providers refuse to send as an address the account
 *  does not own, so the authenticated user is the safer fallback. */
export const mailFrom = (): string => env.MAIL_FROM || env.SMTP_USER || '';

/** What a screen may be told about the mail setup. Deliberately no password,
 *  not even its length. */
export function describeMail(): {
  configured: boolean;
  host: string | null;
  port: number | null;
  from: string | null;
  alsoTo: string | null;
} {
  return {
    configured: mailConfigured(),
    host: env.SMTP_HOST ?? null,
    port: env.SMTP_HOST ? env.SMTP_PORT : null,
    from: mailFrom() || null,
    alsoTo: env.MAIL_TO ?? null,
  };
}

/**
 * Sends one message, best effort.
 *
 * Never throws and never rejects: failing to send an email must not fail the
 * order, the enquiry or the inspection that prompted it. A failure is logged
 * on the server with the provider's own message, which is where somebody
 * debugging a mail problem will look.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const transport = build();
  if (!transport) return false;

  const to = [...new Set(message.to.map((a) => a.trim()).filter(Boolean))];
  if (!to.length) return false;

  try {
    await transport.sendMail({
      from: mailFrom(),
      to,
      subject: message.subject,
      text: message.text,
    });
    return true;
  } catch (err) {
    console.error('[mail] could not send:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Checks the settings actually work, without sending anything to anybody.
 *
 * Connects and authenticates only. Somebody setting this up should be able to
 * find out their password is wrong without mailing the whole team to do it.
 */
export async function verifyMail(): Promise<{ ok: boolean; error?: string }> {
  const transport = build();
  if (!transport) return { ok: false, error: 'SMTP_HOST is not set, so mail is switched off.' };

  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'The mail server refused the connection.' };
  }
}
