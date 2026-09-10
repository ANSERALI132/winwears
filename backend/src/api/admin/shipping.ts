/**
 * Shipping — one consignment against one order.
 *
 * An order can go in several: a container now and the balance when the second
 * run finishes is normal, not an edge case. So what is in each shipment is
 * recorded line by line, and the rule this file exists to enforce is that the
 * sum across every shipment can never exceed what was sold.
 *
 * Nothing here decides that stock has left the building. Dispatching says the
 * crates went on a lorry; taking finished goods off the shelf is a stock
 * movement somebody records — the same reason moving a production card does
 * not make anything.
 */
import { Router } from 'express';
import type { OrderStatus, ShipmentStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import {
  allowedNext,
  canMove,
  fullyShipped,
  isGone,
  nextShipmentReference,
  outstandingFor,
  refusalFor,
  safeTrackingUrl,
} from '../../lib/shipping';
import { dispatch } from '../../lib/webhooks';
import {
  shipmentCreateSchema,
  shipmentItemsSchema,
  shipmentListQuery,
  shipmentStatusSchema,
  shipmentUpdateSchema,
} from '../../validation/shipping';

export const adminShippingRouter = Router();

adminShippingRouter.use(csrfProtection);

const INCLUDE = {
  items: { include: { orderItem: { select: { id: true, description: true, quantity: true } } } },
  events: { orderBy: { createdAt: 'desc' }, include: { by: { select: { id: true, name: true } } } },
  order: {
    select: {
      id: true,
      number: true,
      poNumber: true,
      status: true,
      shipTo: true,
      promisedAt: true,
      company: { select: { id: true, name: true, country: true } },
      contact: { select: { id: true, name: true, email: true } },
      items: { orderBy: { displayOrder: 'asc' }, select: { id: true, description: true, quantity: true } },
    },
  },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ShipmentInclude;

type Row = Prisma.ShipmentGetPayload<{ include: typeof INCLUDE }>;

/** What is still owed on the order travels with the shipment, because the
 *  question "is that everything" is asked on every one of these screens. */
async function serialise(s: Row) {
  const shipped = await prisma.shipmentItem.findMany({
    where: { shipment: { orderId: s.orderId, NOT: { status: 'CANCELLED' } } },
    select: { orderItemId: true, quantity: true, shipmentId: true },
  });

  const outstanding = outstandingFor(s.order.items, shipped);

  return {
    ...s,
    weightKg: s.weightKg === null ? null : Number(s.weightKg.toString()),
    outstanding,
    orderFullyShipped: fullyShipped(outstanding),
    allowedNext: allowedNext(s.status),
    locked: isGone(s.status),
  };
}

const reload = async (id: string) =>
  serialise((await prisma.shipment.findUnique({ where: { id }, include: INCLUDE })) as Row);

/** Checks a set of lines against what the order still has left to send. */
async function assertWithinOrder(orderId: string, lines: Array<{ orderItemId: string; quantity: number }>, excludeShipmentId?: string) {
  const ids = lines.map((l) => l.orderItemId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('The same order line appears twice. Put it on one line with the total.');
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { items: { select: { id: true, description: true, quantity: true } } },
  });
  if (!order) throw badRequest('That order no longer exists.');

  const known = new Set(order.items.map((i) => i.id));
  for (const line of lines) {
    if (!known.has(line.orderItemId)) throw badRequest('One of those lines is not on this order.');
  }

  const shipped = await prisma.shipmentItem.findMany({
    where: { shipment: { orderId, NOT: { status: 'CANCELLED' } } },
    select: { orderItemId: true, quantity: true, shipmentId: true },
  });
  const outstanding = outstandingFor(order.items, shipped, excludeShipmentId);

  for (const line of lines) {
    const left = outstanding.find((o) => o.orderItemId === line.orderItemId);
    if (!left) continue;
    if (line.quantity > left.remaining) {
      throw badRequest(
        `Only ${left.remaining} of "${left.description}" is left to send — ${left.shipped} of ${left.ordered} has already gone. An order cannot be over-shipped.`,
      );
    }
  }
}

adminShippingRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = shipmentListQuery.parse(req.query);

    const and: Prisma.ShipmentWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.orderId) and.push({ orderId: q.orderId });
    if (q.overdue) {
      and.push({ expectedAt: { lt: new Date() }, status: { notIn: ['DELIVERED', 'CANCELLED'] } });
    }
    if (q.q) {
      and.push({
        OR: [
          { reference: { contains: q.q, mode: 'insensitive' } },
          { trackingNumber: { contains: q.q, mode: 'insensitive' } },
          { carrier: { contains: q.q, mode: 'insensitive' } },
          { order: { number: { contains: q.q, mode: 'insensitive' } } },
          { order: { poNumber: { contains: q.q, mode: 'insensitive' } } },
          { order: { company: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.shipment.count({ where }),
      prisma.shipment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: INCLUDE,
      }),
    ]);

    res.json({
      data: await Promise.all(rows.map(serialise)),
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminShippingRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.shipment.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
    if (!row) throw notFound('That shipment no longer exists.');
    res.json({ data: await serialise(row) });
  }),
);

adminShippingRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = shipmentCreateSchema.parse(req.body);

    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, shipTo: true, number: true },
    });
    if (!order) throw badRequest('That order no longer exists.');
    if (order.status === 'CANCELLED') {
      throw badRequest(`Order ${order.number} was cancelled. Nothing ships against it.`);
    }

    if (input.items?.length) await assertWithinOrder(input.orderId, input.items);

    /* Refused rather than quietly dropped: somebody who pasted a bad tracking
       link should be told, not left thinking it was saved. */
    let trackingUrl: string | null = null;
    if (input.trackingUrl) {
      trackingUrl = safeTrackingUrl(input.trackingUrl);
      if (!trackingUrl) throw badRequest('A tracking link has to start with http:// or https://.');
    }

    let created: { id: string; reference: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const reference = await nextShipmentReference(attempt);
      try {
        created = await prisma.shipment.create({
          data: {
            reference,
            orderId: input.orderId,
            carrier: input.carrier ?? null,
            service: input.service ?? null,
            incoterm: input.incoterm ?? null,
            trackingNumber: input.trackingNumber ?? null,
            trackingUrl,
            /* The order's address to start with, then editable: a part
               shipment often goes somewhere else. */
            shipTo: input.shipTo ?? order.shipTo ?? null,
            packages: input.packages,
            weightKg: input.weightKg ?? null,
            dimensions: input.dimensions ?? null,
            expectedAt: input.expectedAt ?? null,
            notes: input.notes ?? null,
            internalNotes: input.internalNotes ?? null,
            createdById: req.admin?.id ?? null,
            ...(input.items?.length
              ? { items: { create: input.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) } }
              : {}),
            events: { create: { toStatus: 'PREPARING', byUserId: req.admin?.id ?? null, note: 'Shipment raised' } },
          },
          select: { id: true, reference: true },
        });
      } catch (err) {
        const collided =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String((err.meta as { target?: string[] } | undefined)?.target ?? '').includes('reference');
        if (!collided) throw err;
      }
    }
    if (!created) throw conflict('Could not allocate a shipment reference. Please try again.');

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'shipment',
      entityId: created.id,
      summary: `${created.reference} for ${order.number}`,
    });

    res.status(201).json({ data: await reload(created.id) });
  }),
);

adminShippingRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = shipmentUpdateSchema.parse(req.body);

    const existing = await prisma.shipment.findUnique({
      where: { id },
      select: { reference: true, status: true },
    });
    if (!existing) throw notFound('That shipment no longer exists.');
    if (existing.status === 'CANCELLED') {
      throw badRequest('This shipment was cancelled and cannot be changed.');
    }

    let trackingUrl: string | null | undefined;
    if (input.trackingUrl !== undefined) {
      if (!input.trackingUrl) trackingUrl = null;
      else {
        trackingUrl = safeTrackingUrl(input.trackingUrl);
        if (!trackingUrl) throw badRequest('A tracking link has to start with http:// or https://.');
      }
    }

    await prisma.shipment.update({
      where: { id },
      data: {
        ...(input.carrier !== undefined ? { carrier: input.carrier || null } : {}),
        ...(input.service !== undefined ? { service: input.service || null } : {}),
        ...(input.incoterm !== undefined ? { incoterm: input.incoterm || null } : {}),
        ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber || null } : {}),
        ...(trackingUrl !== undefined ? { trackingUrl } : {}),
        ...(input.shipTo !== undefined ? { shipTo: input.shipTo || null } : {}),
        ...(input.packages !== undefined ? { packages: input.packages } : {}),
        ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
        ...(input.dimensions !== undefined ? { dimensions: input.dimensions || null } : {}),
        ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes || null } : {}),
      },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'shipment', entityId: id, summary: existing.reference });
    res.json({ data: await reload(id) });
  }),
);

/**
 * What is in the consignment.
 *
 * Replaced wholesale, like quotation lines: reconciling which of twenty lines
 * moved is more code and more ways to be wrong than writing the set in front
 * of the person packing it. Once the consignment has gone, its contents are
 * what the customer will receive, so they stop being editable.
 */
adminShippingRouter.put(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { items } = shipmentItemsSchema.parse(req.body);

    const existing = await prisma.shipment.findUnique({
      where: { id },
      select: { reference: true, status: true, orderId: true },
    });
    if (!existing) throw notFound('That shipment no longer exists.');
    if (isGone(existing.status)) {
      throw badRequest('This shipment has already gone. What is in it is what the customer will receive — raise another one for anything else.');
    }
    if (existing.status === 'CANCELLED') throw badRequest('This shipment was cancelled.');

    await assertWithinOrder(existing.orderId, items, id);

    await prisma.$transaction([
      prisma.shipmentItem.deleteMany({ where: { shipmentId: id } }),
      prisma.shipmentItem.createMany({
        data: items.map((i) => ({ shipmentId: id, orderItemId: i.orderItemId, quantity: i.quantity })),
      }),
    ]);

    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'shipment',
      entityId: id,
      summary: `${existing.reference} — ${items.length} lines`,
    });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Moving a shipment along.
 *
 * Dispatching stamps the date from what the system observed rather than from
 * somebody reconstructing it later, and pulls the order along with it — but
 * only when the whole order has actually gone. A part shipment leaves the
 * order where it is, because it has not shipped.
 */
adminShippingRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = shipmentStatusSchema.parse(req.body);

    const existing = await prisma.shipment.findUnique({
      where: { id },
      select: {
        reference: true, status: true, orderId: true, dispatchedAt: true,
        items: { select: { id: true } },
      },
    });
    if (!existing) throw notFound('That shipment no longer exists.');

    if (input.status === existing.status) {
      res.json({ data: await reload(id) });
      return;
    }
    if (!canMove(existing.status, input.status)) {
      throw badRequest(refusalFor(existing.status, input.status));
    }
    if (input.status === 'CANCELLED' && !input.reason) {
      throw badRequest('Say why the shipment is being cancelled — it is the only record of what happened.');
    }
    /* An empty consignment is a mistake somebody is about to tell a customer
       about. */
    if (input.status === 'DISPATCHED' && !existing.items.length) {
      throw badRequest('There is nothing in this shipment. Add what is going in it before dispatching.');
    }

    await prisma.$transaction([
      prisma.shipment.update({
        where: { id },
        data: {
          status: input.status,
          /* Set once. A shipment that goes DISPATCHED then IN_TRANSIT did not
             leave twice. */
          ...(input.status === 'DISPATCHED' && !existing.dispatchedAt ? { dispatchedAt: new Date() } : {}),
          ...(input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
          ...(input.status === 'CANCELLED' ? { cancelReason: input.reason ?? null } : {}),
        },
      }),
      prisma.shipmentEvent.create({
        data: {
          shipmentId: id,
          fromStatus: existing.status,
          toStatus: input.status,
          byUserId: req.admin?.id ?? null,
          note: input.reason ?? input.note ?? null,
        },
      }),
    ]);

    if (input.status === 'DISPATCHED' || input.status === 'DELIVERED') {
      await followOrder(existing.orderId, input.status, existing.reference, req.admin?.id ?? null);
    }

    if (input.status === 'DISPATCHED') {
      const order = await prisma.order.findUnique({
        where: { id: existing.orderId },
        select: { number: true, poNumber: true },
      });
      const shipment = await prisma.shipment.findUnique({
        where: { id },
        select: { carrier: true, trackingNumber: true, packages: true },
      });
      await dispatch('shipment.dispatched', {
        reference: existing.reference,
        order: order?.number ?? null,
        theirPoNumber: order?.poNumber ?? null,
        carrier: shipment?.carrier ?? null,
        tracking: shipment?.trackingNumber ?? null,
        packages: shipment?.packages ?? 0,
      });
    }

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'shipment',
      entityId: id,
      summary: `${existing.reference}: ${existing.status} -> ${input.status}`,
    });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Pulls the order along behind its shipments — but only when everything on it
 * has actually reached that state.
 *
 * The distinction that matters: being *on* a consignment is not the same as
 * having *gone* on one. An order whose lines are all allocated across two
 * shipments, one of which is still being packed, has not shipped — and
 * marking it shipped is the kind of thing a customer finds out about first.
 * So only shipments that have themselves reached the state are counted.
 */
async function followOrder(
  orderId: string,
  status: 'DISPATCHED' | 'DELIVERED',
  reference: string,
  byUserId: string | null,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, items: { select: { id: true, description: true, quantity: true } } },
  });
  if (!order) return;

  /* Dispatched, in transit and delivered all mean the crates have left; only
     delivered means they arrived. */
  const counts: ShipmentStatus[] =
    status === 'DISPATCHED' ? ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'] : ['DELIVERED'];

  const shipped = await prisma.shipmentItem.findMany({
    where: { shipment: { orderId, status: { in: counts } } },
    select: { orderItemId: true, quantity: true, shipmentId: true },
  });
  if (!fullyShipped(outstandingFor(order.items, shipped))) return;

  const target: OrderStatus = status === 'DISPATCHED' ? 'SHIPPED' : 'DELIVERED';
  /* Only forwards. An order already delivered is not dragged back to shipped
     by a second consignment being marked gone. */
  const movableFrom: OrderStatus[] =
    target === 'SHIPPED'
      ? ['CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP']
      : ['SHIPPED'];
  if (!movableFrom.includes(order.status)) return;

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: target } }),
    prisma.orderEvent.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: target,
        byUserId,
        note: `Shipment ${reference} ${status.toLowerCase()}`,
      },
    }),
  ]);
}

adminShippingRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.shipment.findUnique({
      where: { id },
      select: { reference: true, status: true },
    });
    if (!existing) throw notFound('That shipment no longer exists.');

    if (isGone(existing.status)) {
      throw badRequest('This shipment has gone. It is a record of what the customer was sent and cannot be deleted.');
    }

    await prisma.shipment.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'shipment', entityId: id, summary: existing.reference });
    res.status(204).end();
  }),
);
