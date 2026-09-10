/**
 * Quotations — the priced document, as distinct from the request that asked
 * for one.
 *
 * Every figure on a quotation is entered by a person. Nothing here suggests a
 * price, carries one over from a previous quotation, or fills one in from the
 * catalogue: §13 says pricing is never invented, and a pre-filled price is an
 * invented price that looks authoritative because it appeared by itself.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { computeTotals, decimalToNumber, nextQuotationNumber } from '../../lib/quotation';
import { moveLeadStage } from '../../lib/crm';
import { dispatch } from '../../lib/webhooks';
import {
  quotationCreateSchema,
  quotationListQuery,
  quotationStatusSchema,
  quotationUpdateSchema,
} from '../../validation/quotation';

export const adminQuotationsRouter = Router();

adminQuotationsRouter.use(csrfProtection);

const INCLUDE = {
  items: { orderBy: { displayOrder: 'asc' } },
  company: { select: { id: true, name: true, country: true } },
  contact: { select: { id: true, name: true, email: true } },
  lead: { select: { id: true, reference: true, stage: true } },
  request: { select: { id: true, reference: true } },
  createdBy: { select: { id: true, name: true } },
  /* So a screen can say "this became order WW-SO-2026-0004" rather than
     offering a Convert button that the server is going to refuse. */
  order: { select: { id: true, number: true, status: true } },
} satisfies Prisma.QuotationInclude;

/** Decimals out, numbers in — the browser should never have to parse
 *  "1200.00" out of an object it did not ask for. */
type Row = Prisma.QuotationGetPayload<{ include: typeof INCLUDE }>;

function serialise(q: Row) {
  return {
    ...q,
    subtotal: decimalToNumber(q.subtotal),
    discountInput: decimalToNumber(q.discountInput),
    discountValue: decimalToNumber(q.discountValue),
    shipping: decimalToNumber(q.shipping),
    taxRate: decimalToNumber(q.taxRate),
    taxValue: decimalToNumber(q.taxValue),
    total: decimalToNumber(q.total),
    items: q.items.map((i) => ({
      ...i,
      unitPrice: decimalToNumber(i.unitPrice),
      lineTotal: decimalToNumber(i.lineTotal),
    })),
  };
}

adminQuotationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = quotationListQuery.parse(req.query);

    const and: Prisma.QuotationWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.companyId) and.push({ companyId: q.companyId });
    if (q.leadId) and.push({ leadId: q.leadId });
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { company: { name: { contains: q.q, mode: 'insensitive' } } },
          { contact: { name: { contains: q.q, mode: 'insensitive' } } },
          { items: { some: { description: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: INCLUDE,
      }),
    ]);

    res.json({
      data: rows.map(serialise),
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminQuotationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.quotation.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
    if (!row) throw notFound('That quotation no longer exists.');
    res.json({ data: serialise(row) });
  }),
);

adminQuotationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = quotationCreateSchema.parse(req.body);
    const totals = computeTotals(input);

    /* Retry on a number collision, the same way references are allocated
       elsewhere: counting alone races two people quoting at once. */
    let created: { id: string; number: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const number = await nextQuotationNumber(attempt);
      try {
        created = await prisma.quotation.create({
          data: {
            number,
            companyId: input.companyId ?? null,
            contactId: input.contactId ?? null,
            leadId: input.leadId ?? null,
            requestId: input.requestId ?? null,
            currency: input.currency,
            discountType: input.discountType,
            discountInput: input.discountInput,
            shipping: totals.shipping,
            taxRate: input.taxRate,
            subtotal: totals.subtotal,
            discountValue: totals.discountValue,
            taxValue: totals.taxValue,
            total: totals.total,
            paymentTerms: input.paymentTerms ?? null,
            packaging: input.packaging ?? null,
            leadTime: input.leadTime ?? null,
            validUntil: input.validUntil ?? null,
            notes: input.notes ?? null,
            internalNotes: input.internalNotes ?? null,
            createdById: req.admin?.id ?? null,
            items: {
              create: totals.lines.map((l, i) => ({
                productId: l.productId ?? null,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                lineTotal: l.lineTotal,
                displayOrder: i,
              })),
            },
          },
          select: { id: true, number: true },
        });
      } catch (err) {
        const collided = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!collided) throw err;
      }
    }
    if (!created) throw conflict('Could not allocate a quotation number. Please try again.');

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'quotation',
      entityId: created.id,
      summary: `${created.number} — ${input.currency} ${totals.total.toFixed(2)}`,
    });

    const row = await prisma.quotation.findUnique({ where: { id: created.id }, include: INCLUDE });
    res.status(201).json({ data: serialise(row as Row) });
  }),
);

adminQuotationsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = quotationUpdateSchema.parse(req.body);

    const existing = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw notFound('That quotation no longer exists.');

    /* A document that has gone to a customer is what they are holding. Change
       it and their copy no longer matches ours, which is worse than having to
       raise a second quotation. */
    if (existing.status !== 'DRAFT') {
      throw badRequest('This quotation has already been sent. Raise a new one rather than changing what the customer was given.');
    }

    const items = input.items ?? existing.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: decimalToNumber(i.unitPrice),
      productId: i.productId,
    }));

    const totals = computeTotals({
      items,
      discountType: input.discountType ?? existing.discountType,
      discountInput: input.discountInput ?? decimalToNumber(existing.discountInput),
      shipping: input.shipping ?? decimalToNumber(existing.shipping),
      taxRate: input.taxRate ?? decimalToNumber(existing.taxRate),
    });

    await prisma.$transaction([
      /* Replaced rather than merged: working out which of sixty lines moved,
         changed or vanished is more code and more ways to be wrong than
         writing the set the person is looking at. */
      prisma.quotationItem.deleteMany({ where: { quotationId: id } }),
      prisma.quotation.update({
        where: { id },
        data: {
          ...(input.companyId !== undefined ? { companyId: input.companyId || null } : {}),
          ...(input.contactId !== undefined ? { contactId: input.contactId || null } : {}),
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.discountType ? { discountType: input.discountType } : {}),
          ...(input.discountInput !== undefined ? { discountInput: input.discountInput } : {}),
          ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
          ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms || null } : {}),
          ...(input.packaging !== undefined ? { packaging: input.packaging || null } : {}),
          ...(input.leadTime !== undefined ? { leadTime: input.leadTime || null } : {}),
          ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes || null } : {}),
          shipping: totals.shipping,
          subtotal: totals.subtotal,
          discountValue: totals.discountValue,
          taxValue: totals.taxValue,
          total: totals.total,
          items: {
            create: totals.lines.map((l, i) => ({
              productId: l.productId ?? null,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              displayOrder: i,
            })),
          },
        },
      }),
    ]);

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'quotation', entityId: id, summary: existing.number });

    const row = await prisma.quotation.findUnique({ where: { id }, include: INCLUDE });
    res.json({ data: serialise(row as Row) });
  }),
);

/**
 * Marking a quotation sent, accepted or declined.
 *
 * Separate from the update because each stamps a date and moves the lead —
 * these are events, not fields, and a status that could be set alongside a
 * price change would make it impossible to say when the customer was told.
 */
adminQuotationsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { status } = quotationStatusSchema.parse(req.body);

    const existing = await prisma.quotation.findUnique({
      where: { id },
      select: { number: true, status: true, leadId: true, items: { select: { id: true } } },
    });
    if (!existing) throw notFound('That quotation no longer exists.');

    if (status === 'SENT' && !existing.items.length) {
      throw badRequest('A quotation with no lines cannot be sent.');
    }

    await prisma.quotation.update({
      where: { id },
      data: {
        status,
        ...(status === 'SENT' ? { sentAt: new Date() } : {}),
        ...(status === 'ACCEPTED' || status === 'DECLINED' ? { decidedAt: new Date() } : {}),
      },
    });

    /* Keep the pipeline honest: quoting a customer is a stage, and winning is
       a stage. Only ever forwards — a declined quotation does not close a
       lead that has three others open. */
    if (existing.leadId) {
      if (status === 'SENT') {
        await moveLeadStage({ leadId: existing.leadId, toStage: 'QUOTATION', byUserId: req.admin?.id ?? null, note: `Quotation ${existing.number} sent` });
      } else if (status === 'ACCEPTED') {
        await moveLeadStage({ leadId: existing.leadId, toStage: 'WON', byUserId: req.admin?.id ?? null, note: `Quotation ${existing.number} accepted` });
      }
    }

    if (status === 'SENT' || status === 'ACCEPTED') {
      const fresh = await prisma.quotation.findUnique({
        where: { id },
        select: { number: true, currency: true, total: true },
      });
      await dispatch(status === 'SENT' ? 'quotation.sent' : 'quotation.accepted', {
        number: fresh?.number ?? existing.number,
        currency: fresh?.currency ?? null,
        total: fresh ? decimalToNumber(fresh.total) : null,
      });
    }

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'quotation',
      entityId: id,
      summary: `${existing.number}: ${existing.status} → ${status}`,
    });

    const row = await prisma.quotation.findUnique({ where: { id }, include: INCLUDE });
    res.json({ data: serialise(row as Row) });
  }),
);

adminQuotationsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.quotation.findUnique({ where: { id }, select: { number: true, status: true } });
    if (!existing) throw notFound('That quotation no longer exists.');

    if (existing.status !== 'DRAFT' && existing.status !== 'CANCELLED') {
      throw badRequest('Only a draft or cancelled quotation can be deleted. Cancel it first, so the record of what was sent survives.');
    }

    await prisma.quotation.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'quotation', entityId: id, summary: existing.number });
    res.status(204).end();
  }),
);
