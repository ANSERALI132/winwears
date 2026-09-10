/**
 * Outbound webhooks.
 *
 * When something happens here, tell somewhere else. Generic on purpose: every
 * named connector needs an account, an OAuth dance and API-specific code, and
 * a POST of JSON works with Zapier, n8n, a spreadsheet script or somebody's
 * own ERP without any of that.
 *
 * ── The risk this file exists to contain ───────────────────────────────────
 * A webhook URL is typed by an admin and then fetched *by the server*, from
 * inside the network the server sits in. Left unchecked that is a
 * server-side request forgery: point one at 169.254.169.254 and the reply is
 * the cloud provider's instance credentials; point it at 10.0.0.x and you
 * have a port scanner with a nice UI.
 *
 * So a URL is resolved to its addresses before anything is sent, and refused
 * if any of them is loopback, private, link-local or otherwise not a place on
 * the public internet. That check runs again at delivery time, not only when
 * the webhook is saved, because DNS can change its mind between the two.
 */
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { Prisma, Webhook } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';

/** The events a webhook may subscribe to. A closed list, so a typo in a
 *  subscription is caught when it is saved rather than by silence. */
export const WEBHOOK_EVENTS = [
  'rfq.received',
  'contact.received',
  'quotation.sent',
  'quotation.accepted',
  'order.confirmed',
  'order.status_changed',
  'payment.received',
  'production.completed',
  'qc.failed',
  'shipment.dispatched',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const isWebhookEvent = (value: string): value is WebhookEvent =>
  (WEBHOOK_EVENTS as readonly string[]).includes(value);

/* How hard to try. Four attempts over roughly an hour is enough to ride out
   a receiver's restart without hammering one that is genuinely gone. */
const MAX_ATTEMPTS = 4;
const BACKOFF_MINUTES = [1, 5, 30];

/* ------------------------------------------------------------ addresses -- */

/** Ranges that are not the public internet. */
function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);

  if (version === 4) {
    const p = ip.split('.').map(Number) as [number, number, number, number];
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;  // link-local, incl. cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;  // carrier NAT
    if (p[0] >= 224) return true;  // multicast and reserved
    return false;
  }

  if (version === 6) {
    const a = ip.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('fe80')) return true;  // link-local
    if (a.startsWith('fc') || a.startsWith('fd')) return true;  // unique local

    /* An IPv4 address wearing a v6 hat is still that address — and it does
       not stay in dotted form. `new URL()` rewrites ::ffff:127.0.0.1 as
       ::ffff:7f00:1, so matching on the dotted spelling catches nothing and
       lets loopback straight through. The address is expanded and the last
       32 bits read back out instead. */
    const embedded = embeddedIPv4(a);
    if (embedded) return isPrivateAddress(embedded);

    return false;
  }

  /* Not an IP at all: treat as unsafe rather than assume. */
  return true;
}

/**
 * The IPv4 address inside an IPv6 one, if there is one.
 *
 * Covers the mapped (::ffff:0:0/96), compatible (::/96, deprecated but still
 * parsed) and NAT64 (64:ff9b::/96) prefixes — all three are ways of writing
 * an IPv4 destination, and all three would otherwise walk past a check that
 * only knows what a v6 address usually looks like.
 */
function embeddedIPv4(address: string): string | null {
  const groups = expandIPv6(address);
  if (!groups) return null;

  const mapped = groups[4] === 0 && groups[5] === 0xffff && groups.slice(0, 4).every((g) => g === 0);
  const compatible = groups.slice(0, 6).every((g) => g === 0);
  const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b
    && groups.slice(2, 6).every((g) => g === 0);

  if (!mapped && !compatible && !nat64) return null;

  const high = groups[6] ?? 0;
  const low = groups[7] ?? 0;
  /* ::0.0.0.0 and ::0.0.0.1 are not addresses anybody means; treating them
     as embedded IPv4 would call "::" private twice over, which is harmless
     but confusing. Only the compatible form needs the guard. */
  if (compatible && high === 0 && low <= 1) return null;

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/** An IPv6 address as its eight 16-bit groups, or null if it will not parse. */
function expandIPv6(address: string): number[] | null {
  let text = address;

  /* A trailing dotted quad, as in ::ffff:127.0.0.1, becomes two groups. */
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const [, a, b, c, d] = dotted.map(Number) as [number, number, number, number, number];
    const high = ((a << 8) | b).toString(16);
    const low = ((c << 8) | d).toString(16);
    text = text.slice(0, dotted.index) + `${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parse = (part: string): number[] =>
    part ? part.split(':').filter(Boolean).map((g) => parseInt(g, 16)) : [];

  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];

  if (head.some(Number.isNaN) || tail.some(Number.isNaN)) return null;

  const groups =
    halves.length === 2
      ? [...head, ...new Array<number>(Math.max(0, 8 - head.length - tail.length)).fill(0), ...tail]
      : head;

  return groups.length === 8 ? groups : null;
}

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Whether a URL is somewhere this server may POST to.
 *
 * `WEBHOOK_ALLOW_PRIVATE=true` lifts the address check for local development,
 * where the receiver really is on localhost. It is off by default and named
 * so nobody switches it on in production by accident.
 */
export async function checkWebhookUrl(raw: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'That is not a URL.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'A webhook URL has to start with https:// — nothing else is fetched.' };
  }
  if (url.protocol === 'http:' && !env.WEBHOOK_ALLOW_PRIVATE) {
    return { ok: false, reason: 'Use https. A plain http webhook sends the payload and its signature in clear text.' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Credentials in the URL are not accepted. Use the signature to prove who is calling.' };
  }

  if (env.WEBHOOK_ALLOW_PRIVATE) return { ok: true };

  /* Resolve rather than trust the hostname: "localhost.mycompany.com" can
     point wherever its owner likes. */
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];

  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      const looked = await dns.lookup(host, { all: true });
      addresses = looked.map((a) => a.address);
    } catch {
      return { ok: false, reason: `${url.hostname} does not resolve.` };
    }
  }

  if (!addresses.length) return { ok: false, reason: `${url.hostname} does not resolve.` };

  const blocked = addresses.find(isPrivateAddress);
  if (blocked) {
    return {
      ok: false,
      reason: `${url.hostname} resolves to ${blocked}, which is inside a private network. A webhook has to point at the public internet.`,
    };
  }

  return { ok: true };
}

/* ------------------------------------------------------------ signature -- */

export const newSecret = (): string => `whsec_${crypto.randomBytes(24).toString('base64url')}`;

/**
 * The signature the receiver checks.
 *
 * Timestamp and body together, so a captured call cannot be replayed later
 * against a receiver that checks how old it is.
 */
export function sign(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/* ------------------------------------------------------------- delivery -- */

/**
 * Queues one event for every webhook that wants it.
 *
 * Rows first, sending afterwards and unawaited: the request that caused the
 * event must not wait on somebody else's server, and a delivery that is on
 * the record can be retried even if this process dies a moment later.
 */
export async function dispatch(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  try {
    const hooks = await prisma.webhook.findMany({ where: { active: true } });
    const wanted = hooks.filter((h) => h.events.length === 0 || h.events.includes(event));
    if (!wanted.length) return;

    const body = {
      event,
      sentAt: new Date().toISOString(),
      data: payload,
    } as unknown as Prisma.InputJsonValue;

    const created = await Promise.all(
      wanted.map((hook) =>
        prisma.webhookDelivery.create({
          data: { webhookId: hook.id, event, payload: body, nextAttemptAt: new Date() },
          select: { id: true },
        }),
      ),
    );

    void Promise.all(created.map((d) => attempt(d.id))).catch((err) => {
      console.error('[webhooks] delivery failed', err);
    });
  } catch (err) {
    /* Never let this fail the thing it is reporting on. */
    console.error('[webhooks] could not queue', event, err);
  }
}

/** One attempt at one delivery. Never throws. */
export async function attempt(deliveryId: string): Promise<boolean> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery || delivery.settledAt) return false;

  const hook: Webhook = delivery.webhook;
  const attempts = delivery.attempts + 1;

  /* Checked again here, not only when the webhook was saved: DNS can point
     somewhere else by the time we send. */
  const allowed = await checkWebhookUrl(hook.url);
  if (!allowed.ok) {
    await settle(delivery.id, hook.id, attempts, null, allowed.reason ?? 'refused', true);
    return false;
  }

  const body = JSON.stringify(delivery.payload);
  const timestamp = String(Math.floor(Date.now() / 1000));

  let status: number | null = null;
  let error: string | null = null;

  try {
    const controller = new AbortController();
    /* A receiver that hangs must not hold a socket open for ever. */
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WinWears-Webhook/1',
        'X-WinWears-Event': delivery.event,
        'X-WinWears-Delivery': delivery.id,
        'X-WinWears-Timestamp': timestamp,
        'X-WinWears-Signature': `sha256=${sign(hook.secret, timestamp, body)}`,
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    });
    clearTimeout(timer);

    status = res.status;
    if (!res.ok) error = `the receiver answered ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : 'the request failed';
  }

  const ok = status !== null && status >= 200 && status < 300;
  await settle(delivery.id, hook.id, attempts, status, error, ok || attempts >= MAX_ATTEMPTS);
  return ok;
}

async function settle(
  deliveryId: string,
  webhookId: string,
  attempts: number,
  status: number | null,
  error: string | null,
  final: boolean,
): Promise<void> {
  const ok = status !== null && status >= 200 && status < 300;
  const wait = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 30;

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attempts,
      status,
      error,
      settledAt: final ? new Date() : null,
      nextAttemptAt: final ? null : new Date(Date.now() + wait * 60 * 1000),
    },
  });

  await prisma.webhook.update({
    where: { id: webhookId },
    data: {
      lastStatus: status,
      lastError: error,
      lastAttemptAt: new Date(),
      /* Consecutive failures, so a hook that recovers stops looking broken. */
      failures: ok ? 0 : { increment: 1 },
    },
  });
}

/**
 * Retries whatever is due.
 *
 * Called by the automation sweep, which already runs on a timer — a webhook
 * retry needs durable scheduling, and inventing a second scheduler for it
 * would be more infrastructure than the problem deserves.
 */
export async function retryDueDeliveries(): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { settledAt: null, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: 50,
    select: { id: true },
  });

  let sent = 0;
  for (const d of due) {
    if (await attempt(d.id)) sent += 1;
  }
  return sent;
}
