/**
 * Sending a WhatsApp message to the business's own number.
 *
 * This is the outbound channel for notifications, and it is not the same
 * thing as lib/whatsapp.ts, which builds a wa.me link for a *customer* to
 * click. A wa.me link cannot send anything by itself — it opens a chat and
 * waits for a person. To have a message arrive without anybody clicking, it
 * has to go through Meta's Cloud API.
 *
 * That is the official route and the only one used here. There are libraries
 * that drive WhatsApp Web with a saved session and need no approval; they
 * also break WhatsApp's terms and get numbers banned, which is not a risk
 * worth taking with the number printed on the website.
 *
 * A plain REST call, so no dependency: the Cloud API is one POST.
 *
 * ── The window that catches people out ─────────────────────────────────────
 * WhatsApp lets a business send free-form text only within 24 hours of the
 * recipient's last message to it. Outside that window a message must use a
 * template Meta has approved. Notifications are business-initiated by
 * definition, so:
 *
 *   - with WHATSAPP_TEMPLATE set, a template is sent and always arrives;
 *   - without it, plain text is sent, which arrives only if somebody has
 *     messaged the business number in the last day.
 *
 * Both are supported because the second is genuinely useful — messaging your
 * own business number once a day is a reasonable thing to do — but the
 * difference is stated rather than left to be discovered.
 */
import { env } from '../env';

const API = 'https://graph.facebook.com';

/** Digits only. The Cloud API wants an E.164 number with no plus and no
 *  spaces, and a number typed with either is the commonest reason a send
 *  fails with an unhelpful error. */
export function normaliseNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/[^\d]/g, '');
  /* Short enough to be a mistake rather than a number. */
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export const whatsappConfigured = (): boolean =>
  Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && normaliseNumber(env.WHATSAPP_TO));

/** Which kinds reach the phone. Empty means all — one shared number, so this
 *  is a business setting rather than anybody's own preference. */
export function whatsappKinds(): string[] {
  return env.WHATSAPP_KINDS.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean);
}

export function whatsappWants(kind: string): boolean {
  const wanted = whatsappKinds();
  return wanted.length === 0 || wanted.includes(kind);
}

/** What a screen may be told. No token, not even its length. */
export function describeWhatsapp(): {
  configured: boolean;
  to: string | null;
  usesTemplate: boolean;
  template: string | null;
  apiVersion: string;
  kinds: string[];
} {
  return {
    configured: whatsappConfigured(),
    to: normaliseNumber(env.WHATSAPP_TO),
    usesTemplate: Boolean(env.WHATSAPP_TEMPLATE),
    template: env.WHATSAPP_TEMPLATE ?? null,
    apiVersion: env.WHATSAPP_API_VERSION,
    kinds: whatsappKinds(),
  };
}

async function call(path: string, init: RequestInit): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API}/${env.WHATSAPP_API_VERSION}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN ?? ''}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (res.ok) return { ok: true };

    /* Meta's own message, which is the useful part — it says whether the
       token is wrong, the number unregistered, or the window closed. The
       token itself is never in it, and is never logged alongside it. */
    const body = (await res.json().catch(() => null)) as
      | { error?: { message?: string; error_data?: { details?: string } } }
      | null;
    const detail = body?.error?.error_data?.details || body?.error?.message;
    return { ok: false, error: `${res.status}: ${detail ?? 'the request was refused'}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'could not reach WhatsApp' };
  }
}

/**
 * Sends one notification. Never throws.
 *
 * Failing to send a message must not fail the thing it is reporting on, the
 * same rule the mailer and the activity log follow.
 */
export async function sendWhatsapp(title: string, body: string | null, link: string | null): Promise<boolean> {
  if (!whatsappConfigured()) return false;

  const to = normaliseNumber(env.WHATSAPP_TO);
  if (!to) return false;

  const text = [title, body ?? '', link ?? ''].filter(Boolean).join('\n');

  const payload = env.WHATSAPP_TEMPLATE
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: env.WHATSAPP_TEMPLATE,
          language: { code: env.WHATSAPP_TEMPLATE_LANG },
          /* One body parameter, so a single {{1}} template covers every kind
             of notification rather than needing one approved per kind. */
          components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 900) }] }],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: false, body: text.slice(0, 3500) },
      };

  const result = await call(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    console.error('[whatsapp] could not send:', result.error);
    return false;
  }
  return true;
}

/**
 * Checks the credentials without messaging anybody.
 *
 * Reads the phone number back from the API: a wrong token fails here, and
 * nobody's phone buzzes to find that out.
 */
export async function verifyWhatsapp(): Promise<{ ok: boolean; error?: string }> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: 'WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are not both set, so WhatsApp is off.' };
  }
  if (!normaliseNumber(env.WHATSAPP_TO)) {
    return { ok: false, error: 'WHATSAPP_TO is not a usable phone number.' };
  }

  return call(`${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`, { method: 'GET' });
}
