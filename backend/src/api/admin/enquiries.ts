/**
 * Quote requests and contact messages, from the admin side.
 */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { notFound } from '../../lib/errors';
import {
  contactListQuery,
  contactUpdateSchema,
  quoteListQuery,
  quoteUpdateSchema,
} from '../../validation/enquiry';
import { log } from '../../lib/audit';

export const adminQuotesRouter = Router();
export const adminMessagesRouter = Router();

adminQuotesRouter.use(csrfProtection);
adminMessagesRouter.use(csrfProtection);

/* --------------------------------------------------------------- quotes --- */

adminQuotesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = quoteListQuery.parse(req.query);

    const where: Prisma.QuoteRequestWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { company: { contains: q.q, mode: 'insensitive' } },
              { country: { contains: q.q, mode: 'insensitive' } },
              { whatsapp: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.quoteRequest.count({ where }),
      prisma.quoteRequest.findMany({
        where,
        orderBy: { createdAt: q.sort === 'oldest' ? 'asc' : 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: { product: { select: { id: true, productName: true, sku: true, slug: true } } },
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminQuotesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: String(req.params.id) },
      include: { product: { select: { id: true, productName: true, sku: true, slug: true } } },
    });
    if (!quote) throw notFound('That quote request no longer exists.');
    res.json({ data: quote });
  }),
);

adminQuotesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = quoteUpdateSchema.parse(req.body);

    const quote = await prisma.quoteRequest.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      },
    });

    if (input.status) {
      await log({
        adminId: req.admin?.id,
        action: 'status_changed',
        entity: 'quote',
        entityId: id,
        summary: `${quote.name} -> ${input.status}`,
      });
    }

    res.json({ data: quote });
  }),
);

adminQuotesRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const quote = await prisma.quoteRequest.findUnique({ where: { id } });
    if (!quote) throw notFound('That quote request no longer exists.');

    await prisma.quoteRequest.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'quote', entityId: id, summary: quote.email });
    res.json({ data: { ok: true } });
  }),
);

/* ------------------------------------------------------------- messages --- */

adminMessagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = contactListQuery.parse(req.query);

    const where: Prisma.ContactMessageWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { company: { contains: q.q, mode: 'insensitive' } },
              { subject: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.contactMessage.count({ where }),
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: q.sort === 'oldest' ? 'asc' : 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminMessagesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const message = await prisma.contactMessage.findUnique({ where: { id } });
    if (!message) throw notFound('That message no longer exists.');

    /* Opening an unread message marks it read — one less click. */
    if (message.status === 'NEW') {
      const updated = await prisma.contactMessage.update({ where: { id }, data: { status: 'READ' } });
      res.json({ data: updated });
      return;
    }
    res.json({ data: message });
  }),
);

adminMessagesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { status } = contactUpdateSchema.parse(req.body);
    const message = await prisma.contactMessage.update({ where: { id: String(req.params.id) }, data: { status } });
    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'message',
      entityId: message.id,
      summary: `${message.email} -> ${status}`,
    });
    res.json({ data: message });
  }),
);

adminMessagesRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const message = await prisma.contactMessage.findUnique({ where: { id } });
    if (!message) throw notFound('That message no longer exists.');

    await prisma.contactMessage.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'message', entityId: id, summary: message.email });
    res.json({ data: { ok: true } });
  }),
);
