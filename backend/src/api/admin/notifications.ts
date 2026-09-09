/**
 * Notifications, and what each person wants to hear about.
 *
 * Everything here is scoped to the signed-in admin. A notification is one
 * person's own — read by id and owner, so a guessed id belonging to a
 * colleague misses rather than reads.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { notFound } from '../../lib/errors';
import { NOTIFICATION_KINDS } from '../../lib/notify';
import { describeMail, verifyMail } from '../../lib/mailer';
import { pagination } from '../../validation/common';

export const adminNotificationsRouter = Router();

adminNotificationsRouter.use(csrfProtection);

const notificationKind = z.enum([
  'TASK_ASSIGNED', 'ENQUIRY_RECEIVED', 'AI_ESCALATED',
  'QC_FAILED', 'ORDER_CONFIRMED', 'PAYMENT_RECEIVED',
]);

const listQuery = pagination.extend({
  unreadOnly: z.enum(['1', 'true']).optional(),
});

adminNotificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const userId = req.admin?.id ?? '';

    const where = { userId, ...(q.unreadOnly ? { readAt: null } : {}) };

    const [total, rows, unread] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)), unread },
    });
  }),
);

/** Just the count, for the badge. Kept separate because the shell asks for it
 *  on a timer and has no use for the rows. */
adminNotificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await prisma.notification.count({
      where: { userId: req.admin?.id ?? '', readAt: null },
    });
    res.json({ data: { unread } });
  }),
);

adminNotificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const userId = req.admin?.id ?? '';
    /* updateMany with the owner in the filter: a guessed id belonging to
       somebody else matches nothing rather than reading or writing it. */
    const result = await prisma.notification.updateMany({
      where: { id: String(req.params.id), userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await prisma.notification.findFirst({
        where: { id: String(req.params.id), userId },
        select: { id: true },
      });
      if (!exists) throw notFound('That notification no longer exists.');
      /* Already read. Marking it again is not an error — two tabs open is
         not a mistake anybody made. */
    }
    res.json({ data: { read: true } });
  }),
);

adminNotificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.admin?.id ?? '', readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ data: { marked: result.count } });
  }),
);

adminNotificationsRouter.delete(
  '/read',
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.deleteMany({
      where: { userId: req.admin?.id ?? '', NOT: { readAt: null } },
    });
    res.json({ data: { cleared: result.count } });
  }),
);

/* ------------------------------------------------------------------ mail -- */

/** Whether email is switched on, and where from. Never the password — not
 *  even its length. */
adminNotificationsRouter.get(
  '/mail',
  asyncHandler(async (_req, res) => {
    res.json({ data: describeMail() });
  }),
);

/**
 * Checks the settings work without mailing anybody.
 *
 * Connects and authenticates only. Somebody setting this up should be able to
 * find out their password is wrong without sending the whole team a test.
 */
adminNotificationsRouter.post(
  '/mail/verify',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const result = await verifyMail();
    res.json({ data: { ...describeMail(), ...result } });
  }),
);

/* ---------------------------------------------------------- preferences -- */

adminNotificationsRouter.get(
  '/preferences',
  asyncHandler(async (req, res) => {
    const mutes = await prisma.notificationMute.findMany({
      where: { userId: req.admin?.id ?? '' },
      select: { kind: true },
    });
    const muted = new Set(mutes.map((m) => m.kind));

    res.json({
      /* Absent means on. A kind added later reaches everybody rather than
         nobody, which is the safer default for something you asked to know. */
      data: NOTIFICATION_KINDS.map((k) => ({ ...k, enabled: !muted.has(k.kind) })),
    });
  }),
);

adminNotificationsRouter.put(
  '/preferences',
  asyncHandler(async (req, res) => {
    const { kind, enabled } = z.object({ kind: notificationKind, enabled: z.coerce.boolean() }).parse(req.body);
    const userId = req.admin?.id ?? '';

    if (enabled) {
      await prisma.notificationMute.deleteMany({ where: { userId, kind } });
    } else {
      await prisma.notificationMute.upsert({
        where: { userId_kind: { userId, kind } },
        create: { userId, kind },
        update: {},
      });
    }

    res.json({ data: { kind, enabled } });
  }),
);
