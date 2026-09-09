/**
 * Orders — what an accepted quotation becomes.
 *
 * The quotation is an offer; the order is the commitment. From here the
 * questions stop being "what would this cost" and become "when does it ship"
 * and "has the deposit landed", so this file is mostly about dates, status
 * movements and money that actually arrived.
 *
 * Prices are copied from the accepted quotation rather than recalculated.
 * That is the one place copying a price is right: it is the price the customer
 * agreed to, and quoting them a different one later is exactly the failure the
 * pricing rule exists to prevent.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { computeTotals, decimalToNumber } from '../../lib/quotation';
import { allowedNext, balanceOf, canMove, nextOrderNumber, refusalFor } from '../../lib/order';
import { moveLeadStage } from '../../lib/crm';
import {
  orderCreateSchema,
  orderFromQuotationSchema,
  orderListQuery,
  orderStatusSchema,
  orderUpdateSchema,
  paymentCreateSchema,
} from '../../validation/order';

export const adminOrdersRouter = Router();

adminOrdersRouter.use(csrfProtection);

const INCLUDE = {
  items: { orderBy: { displayOrder: 'asc' } },
  payments: { orderBy: { receivedAt: 'desc' }, include: { recordedBy: { select: { id: true, name: true } } } },
  events: { orderBy: { createdAt: 'desc' }, include: { by: { select: { id: true, name: true } } } },
  company: { select: { id: true, name: true, country: true } },
  contact: { select: { id: true, name: true, email: true, whatsapp: true } },
  lead: { select: { id: true, reference: true, stage: true } },
  quotation: { select: { id: true, number: true, status: true } },
  request: { select: { id: true, reference: true } },
  createdBy: { select: { id: true, name: true } },
  /* So the order can say what the factory is doing about it, rather than
     leaving somebody to search production for the order number. */
  runs: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, reference: true, title: true, status: true, quantityPlanned: true },
  },
  /* Likewise for what has gone out, so "where is it" is answered on the order
     rather than by searching shipping for the order number. */
  shipments: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, reference: true, status: true, carrier: true,
      trackingNumber: true, expectedAt: true, dispatchedAt: true,
      _count: { select: { items: true } },
    },
  },
} satisfies Prisma.OrderInclude;

type Row = Prisma.OrderGetPayload<{ include: typeof INCLUDE }>;

/** Decimals out, numbers in — and the payment position alongside, because
 *  every screen that shows an order shows what is still owed, and each of
 *  them working it out separately is each of them getting it wrong once. */
function serialise(o: Row) {
  return {
    ...o,
    subtotal: decimalToNumber(o.subtotal),
    discountInput: decimalToNumber(o.discountInput),
    discountValue: decimalToNumber(o.discountValue),
    shipping: decimalToNumber(o.shipping),
    taxRate: decimalToNumber(o.taxRate),
    taxValue: decimalToNumber(o.taxValue),
    total: decimalToNumber(o.total),
    items: o.items.map((i) => ({
      ...i,
      unitPrice: decimalToNumber(i.unitPrice),
      lineTotal: decimalToNumber(i.lineTotal),
    })),
    payments: o.payments.map((p) => ({ ...p, amount: decimalToNumber(p.amount) })),
    balance: balanceOf(o.total, o.payments),
    allowedNext: allowedNext(o.status),
  };
}

const reload = async (id: string) =>
  serialise((await prisma.order.findUnique({ where: { id }, include: INCLUDE })) as Row);

adminOrdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = orderListQuery.parse(req.query);

    const and: Prisma.OrderWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.companyId) and.push({ companyId: q.companyId });
    if (q.leadId) and.push({ leadId: q.leadId });
    if (q.late) {
      /* Late means promised in the past and not yet out of the door. An order
         that shipped a day after it was promised was late then, but it is not
         a thing to chase now. */
      and.push({
        promisedAt: { lt: new Date() },
        status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP', 'ON_HOLD'] },
      });
    }
    if (q.q) {
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { poNumber: { contains: q.q, mode: 'insensitive' } },
          { company: { name: { contains: q.q, mode: 'insensitive' } } },
          { contact: { name: { contains: q.q, mode: 'insensitive' } } },
          { quotation: { number: { contains: q.q, mode: 'insensitive' } } },
          { items: { some: { description: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: INCLUDE,
      }),
    ]);

    /* Unpaid is filtered here rather than in SQL: it is the sum of a related
       table compared against a column, and doing it in the query would mean
       raw SQL for a list that is never going to be large enough to need it. */
    let data = rows.map(serialise);
    if (q.unpaid) data = data.filter((o) => o.balance.balance > 0);

    res.json({
      data,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminOrdersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
    if (!row) throw notFound('That order no longer exists.');
    res.json({ data: serialise(row) });
  }),
);

/** Writes an order and its opening event under one number, retrying on a
 *  number collision the way every other reference in the project does. */
async function createOrder(
  data: Omit<Prisma.OrderUncheckedCreateInput, 'number'>,
  lines: Array<{
    productId?: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>,
  byUserId: string | null,
): Promise<{ id: string; number: string }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const number = await nextOrderNumber(attempt);
    try {
      return await prisma.order.create({
        data: {
          ...data,
          number,
          items: {
            create: lines.map((l, i) => ({
              productId: l.productId ?? null,
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              displayOrder: i,
            })),
          },
          events: { create: { toStatus: 'CONFIRMED', byUserId, note: 'Order confirmed' } },
        },
        select: { id: true, number: true },
      });
    } catch (err) {
      const collided =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String((err.meta as { target?: string[] } | undefined)?.target ?? '').includes('number');
      if (!collided) throw err;
    }
  }
  throw conflict('Could not allocate an order number. Please try again.');
}

adminOrdersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = orderCreateSchema.parse(req.body);
    const totals = computeTotals(input);

    const created = await createOrder(
      {
        companyId: input.companyId ?? null,
        contactId: input.contactId ?? null,
        leadId: input.leadId ?? null,
        quotationId: input.quotationId ?? null,
        requestId: input.requestId ?? null,
        poNumber: input.poNumber ?? null,
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
        requiredBy: input.requiredBy ?? null,
        promisedAt: input.promisedAt ?? null,
        shipTo: input.shipTo ?? null,
        notes: input.notes ?? null,
        internalNotes: input.internalNotes ?? null,
        createdById: req.admin?.id ?? null,
      },
      totals.lines,
      req.admin?.id ?? null,
    );

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'order',
      entityId: created.id,
      summary: `${created.number} — ${input.currency} ${totals.total.toFixed(2)}`,
    });

    res.status(201).json({ data: await reload(created.id) });
  }),
);

/**
 * Converting an accepted quotation into an order.
 *
 * The lines, the discount, the shipping, the tax and the totals come across
 * exactly as quoted — not recomputed from the catalogue, and not re-derived
 * from the line inputs, because the customer accepted the figures on the
 * document, whatever has changed since.
 */
adminOrdersRouter.post(
  '/from-quotation/:quotationId',
  asyncHandler(async (req, res) => {
    const quotationId = String(req.params.quotationId);
    const input = orderFromQuotationSchema.parse(req.body);

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        items: { orderBy: { displayOrder: 'asc' } },
        order: { select: { id: true, number: true } },
      },
    });
    if (!quotation) throw notFound('That quotation no longer exists.');

    if (quotation.order) {
      throw conflict(`This quotation is already order ${quotation.order.number}.`);
    }
    /* Only a quotation the customer has accepted becomes an order. Confirming
       one they were never sent, or one they declined, commits the factory to
       work nobody agreed to. */
    if (quotation.status !== 'ACCEPTED') {
      throw badRequest(
        `Only an accepted quotation can become an order. ${quotation.number} is ${quotation.status.toLowerCase()}.`,
      );
    }
    if (!quotation.items.length) throw badRequest('That quotation has no lines.');

    const created = await createOrder(
      {
        companyId: quotation.companyId,
        contactId: quotation.contactId,
        leadId: quotation.leadId,
        quotationId: quotation.id,
        requestId: quotation.requestId,
        poNumber: input.poNumber ?? null,
        currency: quotation.currency,
        discountType: quotation.discountType,
        discountInput: quotation.discountInput,
        shipping: quotation.shipping,
        taxRate: quotation.taxRate,
        subtotal: quotation.subtotal,
        discountValue: quotation.discountValue,
        taxValue: quotation.taxValue,
        total: quotation.total,
        paymentTerms: quotation.paymentTerms,
        packaging: quotation.packaging,
        requiredBy: input.requiredBy ?? null,
        promisedAt: input.promisedAt ?? null,
        shipTo: input.shipTo ?? null,
        /* The quotation's customer-facing notes carry over; its internal notes
           do not. Those were written about winning the work, and the factory
           reading them as instructions is how the wrong thing gets made. */
        notes: quotation.notes,
        internalNotes: input.internalNotes ?? null,
        createdById: req.admin?.id ?? null,
      },
      quotation.items.map((i) => ({
        productId: i.productId,
        description: i.description,
        quantity: i.quantity,
        unitPrice: decimalToNumber(i.unitPrice),
        lineTotal: decimalToNumber(i.lineTotal),
      })),
      req.admin?.id ?? null,
    );

    if (quotation.leadId) {
      await moveLeadStage({
        leadId: quotation.leadId,
        toStage: 'WON',
        byUserId: req.admin?.id ?? null,
        note: `Order ${created.number} raised from ${quotation.number}`,
      });
    }

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'order',
      entityId: created.id,
      summary: `${created.number} from ${quotation.number}`,
    });

    res.status(201).json({ data: await reload(created.id) });
  }),
);

adminOrdersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = orderUpdateSchema.parse(req.body);

    const existing = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw notFound('That order no longer exists.');

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      throw badRequest(
        `This order is ${existing.status.toLowerCase()} and cannot be changed. Raise a new one instead.`,
      );
    }

    /* Once anything has been made or shipped, the priced lines are what the
       factory worked to and what the customer will be invoiced for. Dates,
       addresses and notes stay editable, because those change constantly and
       changing them costs nobody anything. */
    const locked = existing.status !== 'CONFIRMED';
    const pricingTouched =
      input.items !== undefined ||
      input.discountType !== undefined ||
      input.discountInput !== undefined ||
      input.shipping !== undefined ||
      input.taxRate !== undefined ||
      input.currency !== undefined;

    if (locked && pricingTouched) {
      throw badRequest(
        'This order is already in production, so its lines and pricing are fixed. Dates, delivery address and notes can still be changed.',
      );
    }

    const items =
      input.items ??
      existing.items.map((i) => ({
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

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    /* Lines are replaced rather than merged, the same as a quotation: working
       out which of sixty moved, changed or vanished is more code and more
       ways to be wrong than writing the set the person is looking at. */
    if (!locked) writes.push(prisma.orderItem.deleteMany({ where: { orderId: id } }));

    writes.push(
      prisma.order.update({
        where: { id },
        data: {
          ...(input.companyId !== undefined ? { companyId: input.companyId || null } : {}),
          ...(input.contactId !== undefined ? { contactId: input.contactId || null } : {}),
          ...(input.poNumber !== undefined ? { poNumber: input.poNumber || null } : {}),
          ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms || null } : {}),
          ...(input.packaging !== undefined ? { packaging: input.packaging || null } : {}),
          ...(input.requiredBy !== undefined ? { requiredBy: input.requiredBy } : {}),
          ...(input.promisedAt !== undefined ? { promisedAt: input.promisedAt } : {}),
          ...(input.shipTo !== undefined ? { shipTo: input.shipTo || null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes || null } : {}),
          ...(locked
            ? {}
            : {
                ...(input.currency ? { currency: input.currency } : {}),
                ...(input.discountType ? { discountType: input.discountType } : {}),
                ...(input.discountInput !== undefined ? { discountInput: input.discountInput } : {}),
                ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
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
              }),
        },
      }),
    );

    await prisma.$transaction(writes);
    await log({ adminId: req.admin?.id, action: 'updated', entity: 'order', entityId: id, summary: existing.number });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Moving an order along.
 *
 * Separate from the update because a movement is an event: it records who
 * moved it and from where, and lib/order.ts decides whether the move is one
 * an order can make at all.
 */
adminOrdersRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = orderStatusSchema.parse(req.body);

    const existing = await prisma.order.findUnique({
      where: { id },
      select: { number: true, status: true, leadId: true },
    });
    if (!existing) throw notFound('That order no longer exists.');

    if (input.status === existing.status) {
      res.json({ data: await reload(id) });
      return;
    }
    if (!canMove(existing.status, input.status)) {
      throw badRequest(refusalFor(existing.status, input.status));
    }
    /* Cancelling without saying why leaves nobody able to answer the customer
       asking about it in three months. */
    if (input.status === 'CANCELLED' && !input.reason) {
      throw badRequest('Say why the order is being cancelled — it is the only record of what happened.');
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(input.status === 'CANCELLED'
            ? { cancelledAt: new Date(), cancelReason: input.reason ?? null }
            : {}),
        },
      }),
      prisma.orderEvent.create({
        data: {
          orderId: id,
          fromStatus: existing.status,
          toStatus: input.status,
          byUserId: req.admin?.id ?? null,
          note: input.reason ?? input.note ?? null,
        },
      }),
    ]);

    /* A cancelled order does not lose the lead: the same customer may well
       order again, and closing their only open opportunity for them is a
       judgement the sales team should make, not a side effect. */
    if (existing.leadId && input.status === 'CANCELLED') {
      await prisma.lead.update({ where: { id: existing.leadId }, data: { lastActivityAt: new Date() } });
    }

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'order',
      entityId: id,
      summary: `${existing.number}: ${existing.status} -> ${input.status}`,
    });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Recording money that arrived.
 *
 * Never inferred from a status and never assumed from the payment terms:
 * "50% deposit" is what was agreed, not evidence that half the money is in
 * the bank. What is owed is derived from these rows, so this is the only way
 * an order becomes paid.
 */
adminOrdersRouter.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = paymentCreateSchema.parse(req.body);

    const existing = await prisma.order.findUnique({ where: { id }, select: { number: true, currency: true } });
    if (!existing) throw notFound('That order no longer exists.');

    await prisma.orderPayment.create({
      data: {
        orderId: id,
        amount: input.amount,
        method: input.method ?? null,
        reference: input.reference ?? null,
        receivedAt: input.receivedAt ?? new Date(),
        note: input.note ?? null,
        recordedById: req.admin?.id ?? null,
      },
    });

    await log({
      adminId: req.admin?.id,
      action: 'payment_recorded',
      entity: 'order',
      entityId: id,
      summary: `${existing.number} — ${existing.currency} ${input.amount.toFixed(2)}`,
    });

    res.status(201).json({ data: await reload(id) });
  }),
);

/** Removing a payment is correcting a mistake, not undoing a transaction, so
 *  it is restricted and logged with the amount that was taken back out. */
adminOrdersRouter.delete(
  '/:id/payments/:paymentId',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const paymentId = String(req.params.paymentId);

    const payment = await prisma.orderPayment.findFirst({
      where: { id: paymentId, orderId: id },
      include: { order: { select: { number: true, currency: true } } },
    });
    if (!payment) throw notFound('That payment no longer exists.');

    await prisma.orderPayment.delete({ where: { id: paymentId } });
    await log({
      adminId: req.admin?.id,
      action: 'payment_removed',
      entity: 'order',
      entityId: id,
      summary: `${payment.order.number} — ${payment.order.currency} ${decimalToNumber(payment.amount).toFixed(2)}`,
    });

    res.json({ data: await reload(id) });
  }),
);

adminOrdersRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.order.findUnique({
      where: { id },
      select: { number: true, status: true, _count: { select: { payments: true } } },
    });
    if (!existing) throw notFound('That order no longer exists.');

    if (existing.status !== 'CANCELLED') {
      throw badRequest(
        'Only a cancelled order can be deleted. Cancel it first, so the record of what was agreed survives.',
      );
    }
    /* Money that arrived against this order is a bookkeeping record. Deleting
       it because the order was cancelled loses the fact that a refund is
       owed. */
    if (existing._count.payments > 0) {
      throw badRequest('This order has payments recorded against it and cannot be deleted.');
    }

    await prisma.order.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'order', entityId: id, summary: existing.number });
    res.status(204).end();
  }),
);
