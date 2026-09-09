/**
 * Telling people things.
 *
 * Called at the moment something happens, from the route that made it happen.
 * That is the difference from automation, which sweeps for situations that
 * became true with time — an escalated conversation should reach somebody in
 * seconds, not at the next quarter hour.
 *
 * Every write here is best-effort. Failing to tell somebody about an order
 * must never fail the order: the same rule the activity log follows, for the
 * same reason.
 */
import type { NotificationKind } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { mailConfigured, sendMail } from './mailer';
import { sendWhatsapp, whatsappConfigured, whatsappWants } from './whatsappSend';

/** Plain wording for each kind, used on the preferences screen. */
export const NOTIFICATION_KINDS: Array<{ kind: NotificationKind; label: string; detail: string }> = [
  { kind: 'TASK_ASSIGNED', label: 'A task is put on my list', detail: 'By somebody, or by a rule.' },
  { kind: 'ENQUIRY_RECEIVED', label: 'An enquiry arrives', detail: 'A quote request or a contact message.' },
  { kind: 'AI_ESCALATED', label: 'The assistant asks for a person', detail: 'It could not answer and offered the team.' },
  { kind: 'QC_FAILED', label: 'An inspection fails', detail: 'Completed and judged a failure.' },
  { kind: 'ORDER_CONFIRMED', label: 'An order is confirmed', detail: 'Work the factory has just committed to.' },
  { kind: 'PAYMENT_RECEIVED', label: 'A payment is recorded', detail: 'Money against an order.' },
];

/**
 * A link inside the admin, or nothing.
 *
 * These become hrefs, and an admin-writable href is where a javascript: URL
 * gets in. Checked here rather than at the screen, so a bad value never
 * reaches the database in the first place.
 */
export function safeNotificationHref(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return /^#\/[A-Za-z0-9/_\-?=&.]*$/.test(trimmed) ? trimmed : null;
}

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  entity?: string | null;
  entityId?: string | null;
  /** Who to tell. Omitted means everybody who can act on it. */
  userIds?: string[];
  /** Never tell this person — the one who did the thing. Being told about
   *  your own action is noise, and noise is how a bell gets ignored. */
  exceptUserId?: string | null;
}

/** Everybody who could act on it: active accounts only, since a disabled one
 *  cannot sign in to read anything. */
async function audience(): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
  return users.map((u) => u.id);
}

/**
 * The same notification, by email.
 *
 * Sent to the people who are getting it in the admin — the mute has already
 * been applied, so turning a kind off turns off both. MAIL_TO is a shared
 * inbox that receives everything regardless, for when nobody is signed in.
 *
 * A hash route means nothing outside the browser that is already on the page,
 * so the link is made absolute against ADMIN_URL.
 */
async function emailOut(
  input: NotifyInput,
  recipients: string[],
  href: string | null,
): Promise<void> {
  if (!mailConfigured()) return;

  const users = await prisma.user.findMany({
    where: { id: { in: recipients }, active: true, NOT: { email: '' } },
    select: { email: true },
  });

  const to = users.map((u) => u.email);
  if (env.MAIL_TO) to.push(env.MAIL_TO);
  if (!to.length) return;

  const link = href ? `${env.ADMIN_URL.replace(/\/+$/, '')}/${href}` : env.ADMIN_URL;

  await sendMail({
    to,
    subject: `WIN WEARS — ${input.title}`,
    text: [
      input.title,
      input.body ?? '',
      '',
      link,
      '',
      'You are receiving this because it is switched on under',
      'Notifications in the WIN WEARS admin.',
    ]
      .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
      .join('\n'),
  });
}

/**
 * The same notification, on WhatsApp.
 *
 * Sent once per event rather than once per recipient: this is one number the
 * business shares, not an inbox each. Which kinds reach it is a business
 * setting for the same reason — nobody's personal mute should decide whether
 * a phone buzzes for everybody.
 */
async function whatsappOut(input: NotifyInput, href: string | null): Promise<void> {
  if (!whatsappConfigured() || !whatsappWants(input.kind)) return;

  const link = href ? `${env.ADMIN_URL.replace(/\/+$/, '')}/${href}` : env.ADMIN_URL;
  await sendWhatsapp(input.title, input.body ?? null, link);
}

/**
 * Writes one notification per recipient.
 *
 * Muted kinds are dropped per person rather than for everybody: one person
 * turning off payment notices should not stop their colleague seeing them.
 */
export async function notify(input: NotifyInput): Promise<number> {
  try {
    let recipients = input.userIds ?? (await audience());
    if (input.exceptUserId) recipients = recipients.filter((id) => id !== input.exceptUserId);
    if (!recipients.length) return 0;

    const muted = await prisma.notificationMute.findMany({
      where: { kind: input.kind, userId: { in: recipients } },
      select: { userId: true },
    });
    const mutedIds = new Set(muted.map((m) => m.userId));
    recipients = recipients.filter((id) => !mutedIds.has(id));
    if (!recipients.length) return 0;

    const href = safeNotificationHref(input.href);

    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        kind: input.kind,
        title: input.title.slice(0, 200),
        body: input.body ? input.body.slice(0, 500) : null,
        href,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
      })),
    });

    /* Neither is awaited. A round trip to a mail server or to Meta must not
       sit inside the request that caused it — a customer posting the contact
       form should not wait on either. Both log their own failures. */
    void emailOut(input, recipients, href).catch((err) => {
      console.error('[notify] could not send mail', err);
    });
    void whatsappOut(input, href).catch((err) => {
      console.error('[notify] could not send a WhatsApp message', err);
    });

    return recipients.length;
  } catch (err) {
    /* Never let this fail the thing it is reporting on. */
    console.error('[notify] could not write notifications', err);
    return 0;
  }
}
