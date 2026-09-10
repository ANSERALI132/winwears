/**
 * Webhooks — the outbound integration point.
 *
 * A webhook URL is typed by an admin and then fetched by this server from
 * inside its own network, so every URL is checked against the private address
 * ranges before it is saved and again before anything is sent. That check
 * lives in lib/webhooks.ts; this file is the guard around who may set one.
 *
 * Managing webhooks is restricted to administrators. A hook is a standing
 * instruction to send business data to an outside address, which is a
 * different kind of decision from editing a product.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { attempt, checkWebhookUrl, isWebhookEvent, newSecret, WEBHOOK_EVENTS } from '../../lib/webhooks';
import { pagination } from '../../validation/common';

export const adminWebhooksRouter = Router();

adminWebhooksRouter.use(csrfProtection);
/* Every route below, not only the writes: the secret is readable here, and a
   secret is the whole of a receiver's proof that a call is genuine. */
adminWebhooksRouter.use(requireRole('ADMIN'));

const createSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(120),
  url: z.string().trim().min(1, 'Where should it POST to?').max(500),
  events: z.array(z.string().trim().max(60)).max(WEBHOOK_EVENTS.length).default([]),
  active: z.coerce.boolean().default(true),
});

const updateSchema = createSchema.partial();

adminWebhooksRouter.get(
  '/events',
  asyncHandler(async (_req, res) => {
    res.json({ data: { events: [...WEBHOOK_EVENTS] } });
  }),
);

adminWebhooksRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.webhook.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { deliveries: true } },
      },
    });
    res.json({ data: rows });
  }),
);

adminWebhooksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.webhook.findUnique({
      where: { id: String(req.params.id) },
      include: {
        createdBy: { select: { id: true, name: true } },
        deliveries: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!row) throw notFound('That webhook no longer exists.');
    res.json({ data: row });
  }),
);

function checkEvents(events: string[]): string[] {
  const bad = events.filter((e) => !isWebhookEvent(e));
  if (bad.length) {
    throw badRequest(`There is no event called ${bad.join(', ')}. Pick from the list, or leave it empty for all of them.`);
  }
  return [...new Set(events)];
}

adminWebhooksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);

    const allowed = await checkWebhookUrl(input.url);
    if (!allowed.ok) throw badRequest(allowed.reason ?? 'That URL cannot be used.');

    const row = await prisma.webhook.create({
      data: {
        name: input.name,
        url: input.url,
        secret: newSecret(),
        events: checkEvents(input.events),
        active: input.active,
        createdById: req.admin?.id ?? null,
      },
      include: { createdBy: { select: { id: true, name: true } }, _count: { select: { deliveries: true } } },
    });

    await log({ adminId: req.admin?.id, action: 'created', entity: 'webhook', entityId: row.id, summary: row.name });
    res.status(201).json({ data: row });
  }),
);

adminWebhooksRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = updateSchema.parse(req.body);

    const existing = await prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw notFound('That webhook no longer exists.');

    if (input.url && input.url !== existing.url) {
      const allowed = await checkWebhookUrl(input.url);
      if (!allowed.ok) throw badRequest(allowed.reason ?? 'That URL cannot be used.');
    }

    const row = await prisma.webhook.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.url ? { url: input.url } : {}),
        ...(input.events ? { events: checkEvents(input.events) } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        /* A change is a fresh start: a hook that was failing should not still
           look broken after somebody fixed its address. */
        ...(input.url && input.url !== existing.url ? { failures: 0, lastError: null, lastStatus: null } : {}),
      },
      include: { createdBy: { select: { id: true, name: true } }, _count: { select: { deliveries: true } } },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'webhook', entityId: id, summary: row.name });
    res.json({ data: row });
  }),
);

/** A new secret. Anything already signed with the old one stops verifying,
 *  which is the point. */
adminWebhooksRouter.post(
  '/:id/rotate',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.webhook.findUnique({ where: { id }, select: { name: true } });
    if (!existing) throw notFound('That webhook no longer exists.');

    const row = await prisma.webhook.update({ where: { id }, data: { secret: newSecret() } });
    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'webhook',
      entityId: id,
      summary: `${existing.name} — secret rotated`,
    });
    res.json({ data: { id: row.id, secret: row.secret } });
  }),
);

/**
 * Sends a test event.
 *
 * Clearly marked as a test in the payload, so a receiver that acts on what it
 * gets does not book a phantom order because somebody pressed a button here.
 */
adminWebhooksRouter.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const hook = await prisma.webhook.findUnique({ where: { id } });
    if (!hook) throw notFound('That webhook no longer exists.');

    const allowed = await checkWebhookUrl(hook.url);
    if (!allowed.ok) throw badRequest(allowed.reason ?? 'That URL cannot be used.');

    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event: 'order.confirmed',
        payload: {
          event: 'order.confirmed',
          sentAt: new Date().toISOString(),
          test: true,
          data: { note: 'This is a test from the WIN WEARS admin. Nothing has actually happened.' },
        },
        nextAttemptAt: new Date(),
      },
      select: { id: true },
    });

    const ok = await attempt(delivery.id);
    const settled = await prisma.webhookDelivery.findUnique({ where: { id: delivery.id } });

    res.json({ data: { ok, status: settled?.status ?? null, error: settled?.error ?? null } });
  }),
);

/** Sends a failed delivery again, now, without waiting for the sweep. */
adminWebhooksRouter.post(
  '/deliveries/:id/resend',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const delivery = await prisma.webhookDelivery.findUnique({ where: { id } });
    if (!delivery) throw notFound('That delivery no longer exists.');

    /* Reopen it so the attempt is allowed to run and counted properly. */
    await prisma.webhookDelivery.update({
      where: { id },
      data: { settledAt: null, nextAttemptAt: new Date() },
    });

    const ok = await attempt(id);
    const settled = await prisma.webhookDelivery.findUnique({ where: { id } });
    res.json({ data: { ok, status: settled?.status ?? null, error: settled?.error ?? null } });
  }),
);

const deliveryQuery = pagination.extend({
  webhookId: z.string().min(1).max(64).optional(),
  failedOnly: z.enum(['1', 'true']).optional(),
});

adminWebhooksRouter.get(
  '/deliveries/all',
  asyncHandler(async (req, res) => {
    const q = deliveryQuery.parse(req.query);

    const where = {
      ...(q.webhookId ? { webhookId: q.webhookId } : {}),
      ...(q.failedOnly ? { OR: [{ status: null }, { status: { gte: 400 } }] } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.webhookDelivery.count({ where }),
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: { webhook: { select: { id: true, name: true } } },
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminWebhooksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.webhook.findUnique({ where: { id }, select: { name: true } });
    if (!existing) throw notFound('That webhook no longer exists.');

    /* Deliveries go with it: they are that hook's own record and mean nothing
       once it is gone. */
    await prisma.webhook.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'webhook', entityId: id, summary: existing.name });
    res.status(204).end();
  }),
);
