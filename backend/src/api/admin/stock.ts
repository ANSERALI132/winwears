/**
 * Inventory — stock as a ledger, not a number.
 *
 * Every level returned here is the sum of the movements underneath it. There
 * is no stored quantity to increment, so a level and its history can never
 * disagree, and "why are there forty fewer bladders than last week" is always
 * answerable from the record rather than from somebody's memory.
 *
 * Movements are written once and never edited or deleted. A ledger somebody
 * can go back and tidy is not a ledger; a mistake is corrected by an
 * adjustment that says what it is correcting.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { slugify } from '../../lib/slug';
import { decimalToNumber, describeKind, levelOf, signedQuantity } from '../../lib/stock';
import {
  bulkMovementSchema,
  itemCreateSchema,
  itemListQuery,
  itemUpdateSchema,
  locationCreateSchema,
  locationUpdateSchema,
  movementCreateSchema,
  movementListQuery,
} from '../../validation/stock';

export const adminStockRouter = Router();

adminStockRouter.use(csrfProtection);

/* ------------------------------------------------------------ locations -- */

adminStockRouter.get(
  '/locations',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.stockLocation.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { movements: true } } },
    });
    res.json({ data: rows });
  }),
);

adminStockRouter.post(
  '/locations',
  asyncHandler(async (req, res) => {
    const input = locationCreateSchema.parse(req.body);
    const slug = slugify(input.name);
    if (!slug) throw badRequest('That location name has no letters or numbers in it.');

    const clash = await prisma.stockLocation.findUnique({ where: { slug } });
    if (clash) throw conflict(`There is already a location called ${clash.name}.`);

    const row = await prisma.stockLocation.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        displayOrder: input.displayOrder,
        active: input.active,
      },
    });

    await log({ adminId: req.admin?.id, action: 'created', entity: 'stock location', entityId: row.id, summary: row.name });
    res.status(201).json({ data: row });
  }),
);

adminStockRouter.put(
  '/locations/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = locationUpdateSchema.parse(req.body);

    const existing = await prisma.stockLocation.findUnique({ where: { id } });
    if (!existing) throw notFound('That location no longer exists.');

    let slug = existing.slug;
    if (input.name && input.name !== existing.name) {
      slug = slugify(input.name);
      if (!slug) throw badRequest('That location name has no letters or numbers in it.');
      const clash = await prisma.stockLocation.findFirst({ where: { slug, id: { not: id } } });
      if (clash) throw conflict(`There is already a location called ${clash.name}.`);
    }

    const row = await prisma.stockLocation.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name, slug } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'stock location', entityId: id, summary: row.name });
    res.json({ data: row });
  }),
);

adminStockRouter.delete(
  '/locations/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.stockLocation.findUnique({
      where: { id },
      select: { name: true, _count: { select: { movements: true } } },
    });
    if (!existing) throw notFound('That location no longer exists.');

    if (existing._count.movements > 0) {
      throw badRequest('Stock has moved through this location, so it cannot be deleted. Mark it inactive instead — the history stays intact.');
    }

    await prisma.stockLocation.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'stock location', entityId: id, summary: existing.name });
    res.status(204).end();
  }),
);

/* ---------------------------------------------------------------- items -- */

const ITEM_INCLUDE = {
  product: { select: { id: true, productName: true } },
  movements: { select: { quantity: true } },
} satisfies Prisma.StockItemInclude;

type ItemRow = Prisma.StockItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

/** The level travels with the item, because every screen that shows an item
 *  shows what is on hand, and each of them summing separately is each of them
 *  getting it wrong once. */
function serialiseItem(item: ItemRow) {
  const { movements, ...rest } = item;
  return {
    ...rest,
    reorderLevel: item.reorderLevel === null ? null : decimalToNumber(item.reorderLevel),
    level: levelOf(movements, item.reorderLevel),
  };
}

const reloadItem = async (id: string) =>
  serialiseItem((await prisma.stockItem.findUnique({ where: { id }, include: ITEM_INCLUDE })) as ItemRow);

adminStockRouter.get(
  '/items',
  asyncHandler(async (req, res) => {
    const q = itemListQuery.parse(req.query);

    const and: Prisma.StockItemWhereInput[] = [];
    if (q.kind) and.push({ kind: q.kind });
    if (!q.includeRetired) and.push({ active: true });
    if (q.q) {
      and.push({
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { sku: { contains: q.q, mode: 'insensitive' } },
          { description: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.stockItem.count({ where }),
      prisma.stockItem.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: ITEM_INCLUDE,
      }),
    ]);

    /* Low stock is filtered here rather than in SQL: it compares a column
       against the sum of a related table, and doing that in the query would
       mean raw SQL for a list of materials that is never going to be large
       enough to need it. */
    let data = rows.map(serialiseItem);
    if (q.low) data = data.filter((i) => i.level.low);

    res.json({
      data,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminStockRouter.get(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const row = await prisma.stockItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!row) throw notFound('That item no longer exists.');

    /* The ledger for this item, newest first — the answer to "where did it
       go" sits on the same screen as the number it explains. */
    const movements = await prisma.stockMovement.findMany({
      where: { itemId: id },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        location: { select: { id: true, name: true } },
        run: { select: { id: true, reference: true } },
        order: { select: { id: true, number: true } },
        recordedBy: { select: { id: true, name: true } },
      },
    });

    res.json({
      data: {
        ...serialiseItem(row),
        movements: movements.map((m) => ({
          ...m,
          quantity: decimalToNumber(m.quantity),
          kindLabel: describeKind(m.kind),
        })),
      },
    });
  }),
);

adminStockRouter.post(
  '/items',
  asyncHandler(async (req, res) => {
    const input = itemCreateSchema.parse(req.body);
    const sku = input.sku.trim().toUpperCase();

    const clash = await prisma.stockItem.findUnique({ where: { sku } });
    if (clash) throw conflict(`${clash.name} already uses the code ${sku}.`);

    if (input.productId) {
      const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true } });
      if (!product) throw badRequest('That product no longer exists.');
    }

    const row = await prisma.stockItem.create({
      data: {
        name: input.name,
        sku,
        description: input.description ?? null,
        kind: input.kind,
        unit: input.unit ?? null,
        productId: input.productId ?? null,
        reorderLevel: input.reorderLevel ?? null,
        active: input.active,
        notes: input.notes ?? null,
      },
      include: ITEM_INCLUDE,
    });

    await log({ adminId: req.admin?.id, action: 'created', entity: 'stock item', entityId: row.id, summary: `${sku} — ${row.name}` });
    res.status(201).json({ data: serialiseItem(row) });
  }),
);

adminStockRouter.put(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = itemUpdateSchema.parse(req.body);

    const existing = await prisma.stockItem.findUnique({ where: { id } });
    if (!existing) throw notFound('That item no longer exists.');

    let sku = existing.sku;
    if (input.sku && input.sku.trim().toUpperCase() !== existing.sku) {
      sku = input.sku.trim().toUpperCase();
      const clash = await prisma.stockItem.findFirst({ where: { sku, id: { not: id } } });
      if (clash) throw conflict(`${clash.name} already uses the code ${sku}.`);
    }

    await prisma.stockItem.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.sku ? { sku } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.unit !== undefined ? { unit: input.unit || null } : {}),
        ...(input.productId !== undefined ? { productId: input.productId || null } : {}),
        ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'stock item', entityId: id, summary: existing.sku });
    res.json({ data: await reloadItem(id) });
  }),
);

adminStockRouter.delete(
  '/items/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.stockItem.findUnique({
      where: { id },
      select: { name: true, sku: true, _count: { select: { movements: true } } },
    });
    if (!existing) throw notFound('That item no longer exists.');

    /* Deleting the item would take its ledger with it, and the ledger is the
       only record of what was bought and where it went. */
    if (existing._count.movements > 0) {
      throw badRequest('Stock has moved against this item, so it cannot be deleted — its ledger is the only record of what was bought and where it went. Mark it inactive instead.');
    }

    await prisma.stockItem.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'stock item', entityId: id, summary: existing.sku });
    res.status(204).end();
  }),
);

/* ------------------------------------------------------------ movements -- */

/** Checks the things a movement points at actually exist, so a ledger line
 *  can always be traced back to the work it belongs to. */
async function checkReferences(input: { itemId?: string; locationId?: string | null; runId?: string | null; orderId?: string | null }) {
  if (input.itemId) {
    const item = await prisma.stockItem.findUnique({ where: { id: input.itemId }, select: { active: true, name: true } });
    if (!item) throw badRequest('That item no longer exists.');
    if (!item.active) throw badRequest(`${item.name} is retired. Reinstate it before moving stock against it.`);
  }
  if (input.locationId) {
    const location = await prisma.stockLocation.findUnique({ where: { id: input.locationId }, select: { active: true, name: true } });
    if (!location) throw badRequest('That location no longer exists.');
    if (!location.active) throw badRequest(`${location.name} is no longer in use. Pick a location that is still active.`);
  }
  if (input.runId) {
    const run = await prisma.productionRun.findUnique({ where: { id: input.runId }, select: { id: true } });
    if (!run) throw badRequest('That production run no longer exists.');
  }
  if (input.orderId) {
    const order = await prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true } });
    if (!order) throw badRequest('That order no longer exists.');
  }
}

adminStockRouter.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const q = movementListQuery.parse(req.query);

    const where: Prisma.StockMovementWhereInput = {
      ...(q.itemId ? { itemId: q.itemId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.runId ? { runId: q.runId } : {}),
      ...(q.orderId ? { orderId: q.orderId } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: {
          item: { select: { id: true, name: true, sku: true, unit: true } },
          location: { select: { id: true, name: true } },
          run: { select: { id: true, reference: true } },
          order: { select: { id: true, number: true } },
          recordedBy: { select: { id: true, name: true } },
        },
      }),
    ]);

    res.json({
      data: rows.map((m) => ({ ...m, quantity: decimalToNumber(m.quantity), kindLabel: describeKind(m.kind) })),
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

/**
 * Writing one movement.
 *
 * The sign comes from the kind, never from the form: an issue cannot be
 * entered as an increase, and nobody has to remember a minus sign at the end
 * of a long day. An adjustment is the exception, and it carries a reason.
 */
adminStockRouter.post(
  '/movements',
  asyncHandler(async (req, res) => {
    const input = movementCreateSchema.parse(req.body);
    await checkReferences(input);

    const quantity = signedQuantity(input.kind, input.quantity);

    const movement = await prisma.stockMovement.create({
      data: {
        itemId: input.itemId,
        locationId: input.locationId ?? null,
        kind: input.kind,
        quantity,
        runId: input.runId ?? null,
        orderId: input.orderId ?? null,
        reference: input.reference ?? null,
        note: input.note ?? null,
        occurredAt: input.occurredAt ?? new Date(),
        recordedById: req.admin?.id ?? null,
      },
      include: { item: { select: { name: true, sku: true, unit: true } } },
    });

    await log({
      adminId: req.admin?.id,
      action: 'stock_moved',
      entity: 'stock item',
      entityId: input.itemId,
      summary: `${movement.item.sku}: ${describeKind(input.kind)} ${quantity}${movement.item.unit ? ' ' + movement.item.unit : ''}`,
    });

    res.status(201).json({ data: await reloadItem(input.itemId) });
  }),
);

/**
 * Several movements at once — a delivery covering a dozen materials, or a
 * stocktake. All of one kind, written together or not at all: half a delivery
 * on the ledger is worse than none of it.
 */
adminStockRouter.post(
  '/movements/bulk',
  asyncHandler(async (req, res) => {
    const input = bulkMovementSchema.parse(req.body);

    if (input.kind === 'ADJUSTMENT') {
      throw badRequest('Adjustments are recorded one at a time, because each one needs its own reason.');
    }

    const ids = input.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) {
      throw badRequest('The same item appears twice. Put it on one line with the total.');
    }

    await checkReferences({ locationId: input.locationId, runId: input.runId, orderId: input.orderId });
    const items = await prisma.stockItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, active: true },
    });
    if (items.length !== ids.length) throw badRequest('One of those items no longer exists.');
    const retired = items.find((i) => !i.active);
    if (retired) throw badRequest(`${retired.name} is retired. Reinstate it before moving stock against it.`);

    const when = input.occurredAt ?? new Date();
    await prisma.stockMovement.createMany({
      data: input.lines.map((line) => ({
        itemId: line.itemId,
        locationId: input.locationId ?? null,
        kind: input.kind,
        quantity: signedQuantity(input.kind, line.quantity),
        runId: input.runId ?? null,
        orderId: input.orderId ?? null,
        reference: input.reference ?? null,
        note: line.note ?? null,
        occurredAt: when,
        recordedById: req.admin?.id ?? null,
      })),
    });

    await log({
      adminId: req.admin?.id,
      action: 'stock_moved',
      entity: 'stock item',
      summary: `${describeKind(input.kind)} — ${input.lines.length} items${input.reference ? ' (' + input.reference + ')' : ''}`,
    });

    const rows = await prisma.stockItem.findMany({ where: { id: { in: ids } }, include: ITEM_INCLUDE });
    res.status(201).json({ data: rows.map(serialiseItem) });
  }),
);

/* A movement has no update or delete. The ledger is written once: a mistake
   is corrected by an adjustment that says what it is correcting, which leaves
   both the error and the correction on the record where an audit can find
   them. */
