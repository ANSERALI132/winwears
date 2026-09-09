/**
 * Manufacturing — the factory's answer to an order line.
 *
 * The order says what was sold; a production run says what is actually being
 * made, how much of it exists, and where it is. Progress is counted from
 * output somebody recorded, never inferred from the stage a run is sitting
 * in: a run parked in "packing" is evidence that a card was moved, not that
 * anything was packed.
 *
 * Stages are rows, not an enum. A hand-stitched ball and a thermo-bonded one
 * do not go through the same steps, so WIN WEARS defines its own. Nothing is
 * seeded — a made-up list of stages would read as though somebody had
 * surveyed the factory floor.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { slugify } from '../../lib/slug';
import { allowedNext, canMove, nextRunReference, progressOf, refusalFor } from '../../lib/production';
import {
  outputCreateSchema,
  runCreateSchema,
  runListQuery,
  runStageSchema,
  runStatusSchema,
  runUpdateSchema,
  stageCreateSchema,
  stageReorderSchema,
  stageUpdateSchema,
} from '../../validation/production';

export const adminProductionRouter = Router();

adminProductionRouter.use(csrfProtection);

/* --------------------------------------------------------------- stages -- */

adminProductionRouter.get(
  '/stages',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.productionStage.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { runs: true } } },
    });
    res.json({ data: rows });
  }),
);

adminProductionRouter.post(
  '/stages',
  asyncHandler(async (req, res) => {
    const input = stageCreateSchema.parse(req.body);
    const slug = slugify(input.name);
    if (!slug) throw badRequest('That stage name has no letters or numbers in it.');

    const clash = await prisma.productionStage.findUnique({ where: { slug } });
    if (clash) throw conflict(`There is already a stage called ${clash.name}.`);

    const row = await prisma.productionStage.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        displayOrder: input.displayOrder,
        active: input.active,
      },
    });

    await log({ adminId: req.admin?.id, action: 'created', entity: 'production stage', entityId: row.id, summary: row.name });
    res.status(201).json({ data: row });
  }),
);

adminProductionRouter.put(
  '/stages/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = stageUpdateSchema.parse(req.body);

    const existing = await prisma.productionStage.findUnique({ where: { id } });
    if (!existing) throw notFound('That stage no longer exists.');

    let slug = existing.slug;
    if (input.name && input.name !== existing.name) {
      slug = slugify(input.name);
      if (!slug) throw badRequest('That stage name has no letters or numbers in it.');
      const clash = await prisma.productionStage.findFirst({ where: { slug, id: { not: id } } });
      if (clash) throw conflict(`There is already a stage called ${clash.name}.`);
    }

    const row = await prisma.productionStage.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name, slug } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'production stage', entityId: id, summary: row.name });
    res.json({ data: row });
  }),
);

adminProductionRouter.patch(
  '/stages/order',
  asyncHandler(async (req, res) => {
    const { order } = stageReorderSchema.parse(req.body);
    await prisma.$transaction(
      order.map((id, index) => prisma.productionStage.update({ where: { id }, data: { displayOrder: index } })),
    );
    await log({ adminId: req.admin?.id, action: 'reordered', entity: 'production stage', summary: `${order.length} stages` });
    res.json({ data: { reordered: order.length } });
  }),
);

adminProductionRouter.delete(
  '/stages/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.productionStage.findUnique({
      where: { id },
      select: { name: true, _count: { select: { runs: true, outputs: true } } },
    });
    if (!existing) throw notFound('That stage no longer exists.');

    /* A stage that work has passed through is part of that work's history.
       Deleting it would leave finished runs unable to say where they went, so
       retiring is offered instead. */
    if (existing._count.runs > 0 || existing._count.outputs > 0) {
      throw badRequest('Work has passed through this stage, so it cannot be deleted. Mark it inactive instead — it will stop appearing on new runs and the history stays intact.');
    }

    await prisma.productionStage.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'production stage', entityId: id, summary: existing.name });
    res.status(204).end();
  }),
);

/* ----------------------------------------------------------------- runs -- */

const INCLUDE = {
  currentStage: { select: { id: true, name: true, displayOrder: true } },
  owner: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  product: { select: { id: true, productName: true } },
  order: {
    select: {
      id: true,
      number: true,
      status: true,
      promisedAt: true,
      company: { select: { id: true, name: true } },
    },
  },
  orderItem: { select: { id: true, description: true, quantity: true } },
  outputs: {
    orderBy: { recordedAt: 'desc' },
    include: {
      stage: { select: { id: true, name: true } },
      recordedBy: { select: { id: true, name: true } },
    },
  },
  events: {
    orderBy: { createdAt: 'desc' },
    include: {
      fromStage: { select: { id: true, name: true } },
      toStage: { select: { id: true, name: true } },
      by: { select: { id: true, name: true } },
    },
  },
  /* So a supervisor sees quality control where the work is, rather than
     searching inspections for the run reference. */
  inspections: {
    orderBy: { inspectedAt: 'desc' },
    select: {
      id: true, reference: true, result: true, overrideResult: true,
      sampleSize: true, completedAt: true, inspectedAt: true,
    },
  },
} satisfies Prisma.ProductionRunInclude;

type Row = Prisma.ProductionRunGetPayload<{ include: typeof INCLUDE }>;

/** Progress travels with the run, because every screen that shows a run shows
 *  how far along it is, and each of them counting separately is each of them
 *  getting it wrong once. */
function serialise(r: Row) {
  return {
    ...r,
    progress: progressOf(r.quantityPlanned, r.outputs),
    allowedNext: allowedNext(r.status),
  };
}

const reload = async (id: string) =>
  serialise((await prisma.productionRun.findUnique({ where: { id }, include: INCLUDE })) as Row);

adminProductionRouter.get(
  '/runs',
  asyncHandler(async (req, res) => {
    const q = runListQuery.parse(req.query);

    const and: Prisma.ProductionRunWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.orderId) and.push({ orderId: q.orderId });
    if (q.stageId) and.push({ currentStageId: q.stageId });
    if (q.ownerId) and.push({ ownerId: q.ownerId });
    if (q.late) {
      /* Late means due in the past and not finished. A run that overran and
         then completed was late at the time, but it is not work to chase now. */
      and.push({ plannedEnd: { lt: new Date() }, status: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] } });
    }
    if (q.q) {
      and.push({
        OR: [
          { reference: { contains: q.q, mode: 'insensitive' } },
          { title: { contains: q.q, mode: 'insensitive' } },
          { order: { number: { contains: q.q, mode: 'insensitive' } } },
          { order: { company: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.productionRun.count({ where }),
      prisma.productionRun.findMany({
        where,
        /* Due first: a list of factory work is read to find what is next, not
           to find what was entered most recently. */
        orderBy: [{ plannedEnd: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
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

adminProductionRouter.get(
  '/runs/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.productionRun.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
    if (!row) throw notFound('That production run no longer exists.');
    res.json({ data: serialise(row) });
  }),
);

adminProductionRouter.post(
  '/runs',
  asyncHandler(async (req, res) => {
    const input = runCreateSchema.parse(req.body);

    if (input.plannedStart && input.plannedEnd && input.plannedEnd < input.plannedStart) {
      throw badRequest('The run cannot be due before it starts.');
    }

    /* A line belongs to an order. Accepting a mismatched pair would produce a
       run that reports against work it is not doing. */
    if (input.orderItemId) {
      const item = await prisma.orderItem.findUnique({
        where: { id: input.orderItemId },
        select: { orderId: true },
      });
      if (!item) throw badRequest('That order line no longer exists.');
      if (input.orderId && item.orderId !== input.orderId) {
        throw badRequest('That line belongs to a different order.');
      }
      input.orderId = item.orderId;
    }

    let created: { id: string; reference: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const reference = await nextRunReference(attempt);
      try {
        created = await prisma.productionRun.create({
          data: {
            reference,
            title: input.title,
            orderId: input.orderId ?? null,
            orderItemId: input.orderItemId ?? null,
            productId: input.productId ?? null,
            quantityPlanned: input.quantityPlanned,
            ownerId: input.ownerId ?? null,
            plannedStart: input.plannedStart ?? null,
            plannedEnd: input.plannedEnd ?? null,
            notes: input.notes ?? null,
            createdById: req.admin?.id ?? null,
            events: { create: { toStatus: 'PLANNED', byUserId: req.admin?.id ?? null, note: 'Run planned' } },
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
    if (!created) throw conflict('Could not allocate a run reference. Please try again.');

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'production run',
      entityId: created.id,
      summary: `${created.reference} — ${input.quantityPlanned} × ${input.title}`,
    });

    res.status(201).json({ data: await reload(created.id) });
  }),
);

adminProductionRouter.put(
  '/runs/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = runUpdateSchema.parse(req.body);

    const existing = await prisma.productionRun.findUnique({
      where: { id },
      select: { reference: true, status: true, plannedStart: true, plannedEnd: true, outputs: { select: { quantityGood: true, quantityRejected: true } } },
    });
    if (!existing) throw notFound('That production run no longer exists.');

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw badRequest(`This run is ${existing.status.toLowerCase()} and cannot be changed. Raise a new one instead, so what it made survives.`);
    }

    const plannedStart = input.plannedStart ?? existing.plannedStart;
    const plannedEnd = input.plannedEnd ?? existing.plannedEnd;
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
      throw badRequest('The run cannot be due before it starts.');
    }

    /* Cutting the target below what has already been made would make the
       numbers on every screen disagree with the units on the floor. */
    if (input.quantityPlanned !== undefined) {
      const made = existing.outputs.reduce((sum, o) => sum + o.quantityGood + o.quantityRejected, 0);
      if (input.quantityPlanned < made) {
        throw badRequest(`${made} units have already been recorded against this run, so it cannot be planned for fewer than that.`);
      }
    }

    const row = await prisma.productionRun.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.quantityPlanned !== undefined ? { quantityPlanned: input.quantityPlanned } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId || null } : {}),
        ...(input.productId !== undefined ? { productId: input.productId || null } : {}),
        ...(input.plannedStart !== undefined ? { plannedStart: input.plannedStart } : {}),
        ...(input.plannedEnd !== undefined ? { plannedEnd: input.plannedEnd } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
      select: { id: true },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'production run', entityId: id, summary: existing.reference });
    res.json({ data: await reload(row.id) });
  }),
);

/**
 * Moving a run between stages.
 *
 * Separate from the update because it is an event: it records who moved it
 * and from where, and that history is the only way to answer how long
 * something sat in stitching.
 */
adminProductionRouter.patch(
  '/runs/:id/stage',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = runStageSchema.parse(req.body);

    const existing = await prisma.productionRun.findUnique({
      where: { id },
      select: { reference: true, status: true, currentStageId: true },
    });
    if (!existing) throw notFound('That production run no longer exists.');

    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw badRequest(`This run is ${existing.status.toLowerCase()} and is not moving anywhere.`);
    }

    let stageName = 'not started';
    if (input.stageId) {
      const stage = await prisma.productionStage.findUnique({
        where: { id: input.stageId },
        select: { name: true, active: true },
      });
      if (!stage) throw badRequest('That stage no longer exists.');
      /* A retired stage stays on the runs that went through it, but nothing
         new is sent there — that is what retiring it meant. */
      if (!stage.active) throw badRequest(`${stage.name} is no longer in use. Pick a stage that is still active.`);
      stageName = stage.name;
    }

    if (existing.currentStageId === input.stageId) {
      res.json({ data: await reload(id) });
      return;
    }

    await prisma.$transaction([
      prisma.productionRun.update({ where: { id }, data: { currentStageId: input.stageId } }),
      prisma.productionEvent.create({
        data: {
          runId: id,
          fromStageId: existing.currentStageId,
          toStageId: input.stageId,
          byUserId: req.admin?.id ?? null,
          note: input.note ?? null,
        },
      }),
    ]);

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'production run',
      entityId: id,
      summary: `${existing.reference} moved to ${stageName}`,
    });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Starting, holding, finishing or cancelling a run.
 *
 * The dates that answer "was it late" are stamped here, from what the system
 * observed, rather than typed in afterwards by somebody reconstructing it.
 */
adminProductionRouter.patch(
  '/runs/:id/status',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = runStatusSchema.parse(req.body);

    const existing = await prisma.productionRun.findUnique({
      where: { id },
      select: {
        reference: true, status: true, actualStart: true, orderId: true,
        quantityPlanned: true, outputs: { select: { quantityGood: true, quantityRejected: true } },
      },
    });
    if (!existing) throw notFound('That production run no longer exists.');

    if (input.status === existing.status) {
      res.json({ data: await reload(id) });
      return;
    }
    if (!canMove(existing.status, input.status)) {
      throw badRequest(refusalFor(existing.status, input.status));
    }
    if (input.status === 'CANCELLED' && !input.reason) {
      throw badRequest('Say why the run is being cancelled — it is the only record of what happened.');
    }
    /* Completing a run with nothing recorded against it would report work
       that nobody can point at. Short is fine and normal; nothing is not. */
    if (input.status === 'COMPLETED') {
      const good = existing.outputs.reduce((sum, o) => sum + o.quantityGood, 0);
      if (good === 0) {
        throw badRequest('Nothing has been recorded as made on this run. Record what came off the line before completing it.');
      }
    }

    await prisma.$transaction([
      prisma.productionRun.update({
        where: { id },
        data: {
          status: input.status,
          /* Set once. Resuming after a hold does not rewrite when the work
             actually started. */
          ...(input.status === 'IN_PROGRESS' && !existing.actualStart ? { actualStart: new Date() } : {}),
          ...(input.status === 'COMPLETED' ? { actualEnd: new Date() } : {}),
          ...(input.status === 'CANCELLED' ? { cancelReason: input.reason ?? null } : {}),
        },
      }),
      prisma.productionEvent.create({
        data: {
          runId: id,
          fromStatus: existing.status,
          toStatus: input.status,
          byUserId: req.admin?.id ?? null,
          note: input.reason ?? input.note ?? null,
        },
      }),
    ]);

    /* Starting work is what IN_PRODUCTION means on the order, so the order
       follows the floor rather than waiting for somebody to remember. Only
       forwards from CONFIRMED: an order already past this is not dragged
       back by a second run starting. */
    if (input.status === 'IN_PROGRESS' && existing.orderId) {
      const order = await prisma.order.findUnique({ where: { id: existing.orderId }, select: { status: true } });
      if (order?.status === 'CONFIRMED') {
        await prisma.$transaction([
          prisma.order.update({ where: { id: existing.orderId }, data: { status: 'IN_PRODUCTION' } }),
          prisma.orderEvent.create({
            data: {
              orderId: existing.orderId,
              fromStatus: 'CONFIRMED',
              toStatus: 'IN_PRODUCTION',
              byUserId: req.admin?.id ?? null,
              note: `Production run ${existing.reference} started`,
            },
          }),
        ]);
      }
    }

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'production run',
      entityId: id,
      summary: `${existing.reference}: ${existing.status} -> ${input.status}`,
    });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Recording what came off the line.
 *
 * The only thing that moves a run's progress. Rejected units are counted
 * separately from good ones, so a run that made its number twice over because
 * half of it failed cannot look like a run that went well.
 */
adminProductionRouter.post(
  '/runs/:id/output',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = outputCreateSchema.parse(req.body);

    const existing = await prisma.productionRun.findUnique({
      where: { id },
      select: { reference: true, status: true, currentStageId: true },
    });
    if (!existing) throw notFound('That production run no longer exists.');

    if (existing.status === 'CANCELLED') {
      throw badRequest('This run was cancelled. Nothing more can be recorded against it.');
    }
    if (existing.status === 'PLANNED') {
      throw badRequest('This run has not started. Start it first, so the date it began is the date work actually began.');
    }

    if (input.stageId) {
      const stage = await prisma.productionStage.findUnique({ where: { id: input.stageId }, select: { id: true } });
      if (!stage) throw badRequest('That stage no longer exists.');
    }

    await prisma.productionOutput.create({
      data: {
        runId: id,
        /* Falls back to wherever the run is, which is almost always what the
           person at the machine means. */
        stageId: input.stageId ?? existing.currentStageId ?? null,
        quantityGood: input.quantityGood,
        quantityRejected: input.quantityRejected,
        recordedAt: input.recordedAt ?? new Date(),
        note: input.note ?? null,
        recordedById: req.admin?.id ?? null,
      },
    });

    await log({
      adminId: req.admin?.id,
      action: 'output_recorded',
      entity: 'production run',
      entityId: id,
      summary: `${existing.reference} — ${input.quantityGood} good, ${input.quantityRejected} rejected`,
    });

    res.status(201).json({ data: await reload(id) });
  }),
);

/** Removing an entry is correcting a miscount, not un-making anything, so it
 *  is restricted and logged with the figures that were taken back out. */
adminProductionRouter.delete(
  '/runs/:id/output/:outputId',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const outputId = String(req.params.outputId);

    const entry = await prisma.productionOutput.findFirst({
      where: { id: outputId, runId: id },
      include: { run: { select: { reference: true } } },
    });
    if (!entry) throw notFound('That entry no longer exists.');

    await prisma.productionOutput.delete({ where: { id: outputId } });
    await log({
      adminId: req.admin?.id,
      action: 'output_removed',
      entity: 'production run',
      entityId: id,
      summary: `${entry.run.reference} — ${entry.quantityGood} good, ${entry.quantityRejected} rejected`,
    });

    res.json({ data: await reload(id) });
  }),
);

adminProductionRouter.delete(
  '/runs/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.productionRun.findUnique({
      where: { id },
      select: { reference: true, status: true, _count: { select: { outputs: true } } },
    });
    if (!existing) throw notFound('That production run no longer exists.');

    if (existing.status !== 'PLANNED' && existing.status !== 'CANCELLED') {
      throw badRequest('Only a planned or cancelled run can be deleted. Cancel it first, so the record of what was scheduled survives.');
    }
    if (existing._count.outputs > 0) {
      throw badRequest('Units have been recorded against this run, so it cannot be deleted.');
    }

    await prisma.productionRun.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'production run', entityId: id, summary: existing.reference });
    res.status(204).end();
  }),
);
