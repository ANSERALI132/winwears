/**
 * Quality control — a sample, judged against this factory's own checkpoints.
 *
 * Deliberately separate from production output: output counts what was made,
 * an inspection judges a sample of it. Folding the two together would either
 * double-count the units or lose the judgement.
 *
 * Nothing is seeded. A ball's weight, circumference, bounce and water
 * absorption all have published standards, but which of them WIN WEARS tests,
 * to what limits, and which are pass-or-fail is a fact about this factory.
 * Numbers invented here would end up on a QC report nobody ever agreed to.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { slugify } from '../../lib/slug';
import { hasCriticalFailure, judge, nextInspectionReference, summarise } from '../../lib/qc';
import {
  checkpointCreateSchema,
  checkpointUpdateSchema,
  completeSchema,
  inspectionCreateSchema,
  inspectionListQuery,
  inspectionUpdateSchema,
  overrideSchema,
  resultsSchema,
} from '../../validation/qc';

export const adminQcRouter = Router();

adminQcRouter.use(csrfProtection);

const decimal = (value: Prisma.Decimal | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value.toString());
};

/* ---------------------------------------------------------- checkpoints -- */

const serialiseCheckpoint = <T extends { minValue: Prisma.Decimal | null; maxValue: Prisma.Decimal | null }>(c: T) => ({
  ...c,
  minValue: decimal(c.minValue),
  maxValue: decimal(c.maxValue),
});

adminQcRouter.get(
  '/checkpoints',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.qcCheckpoint.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { results: true } } },
    });
    res.json({ data: rows.map(serialiseCheckpoint) });
  }),
);

adminQcRouter.post(
  '/checkpoints',
  asyncHandler(async (req, res) => {
    const input = checkpointCreateSchema.parse(req.body);
    const slug = slugify(input.name);
    if (!slug) throw badRequest('That checkpoint name has no letters or numbers in it.');

    const clash = await prisma.qcCheckpoint.findUnique({ where: { slug } });
    if (clash) throw conflict(`There is already a checkpoint called ${clash.name}.`);

    const row = await prisma.qcCheckpoint.create({
      data: {
        name: input.name,
        slug,
        description: input.description ?? null,
        kind: input.kind,
        unit: input.unit ?? null,
        minValue: input.minValue ?? null,
        maxValue: input.maxValue ?? null,
        critical: input.critical,
        displayOrder: input.displayOrder,
        active: input.active,
      },
    });

    await log({ adminId: req.admin?.id, action: 'created', entity: 'qc checkpoint', entityId: row.id, summary: row.name });
    res.status(201).json({ data: serialiseCheckpoint(row) });
  }),
);

adminQcRouter.put(
  '/checkpoints/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = checkpointUpdateSchema.parse(req.body);

    const existing = await prisma.qcCheckpoint.findUnique({
      where: { id },
      include: { _count: { select: { results: true } } },
    });
    if (!existing) throw notFound('That checkpoint no longer exists.');

    /* Changing a limit under an inspection that has already been judged
       against it would rewrite history: the same reading would suddenly read
       as a pass. Retire it and add the new one, so old reports still say what
       they were measured against. */
    const limitsTouched =
      input.minValue !== undefined || input.maxValue !== undefined || input.kind !== undefined;
    if (limitsTouched && existing._count.results > 0) {
      throw badRequest('Inspections have already been judged against this checkpoint, so its limits cannot be changed. Retire it and add a new one — old reports must keep saying what they were measured against.');
    }

    let slug = existing.slug;
    if (input.name && input.name !== existing.name) {
      slug = slugify(input.name);
      if (!slug) throw badRequest('That checkpoint name has no letters or numbers in it.');
      const clash = await prisma.qcCheckpoint.findFirst({ where: { slug, id: { not: id } } });
      if (clash) throw conflict(`There is already a checkpoint called ${clash.name}.`);
    }

    const row = await prisma.qcCheckpoint.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name, slug } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.unit !== undefined ? { unit: input.unit || null } : {}),
        ...(input.minValue !== undefined ? { minValue: input.minValue } : {}),
        ...(input.maxValue !== undefined ? { maxValue: input.maxValue } : {}),
        ...(input.critical !== undefined ? { critical: input.critical } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'qc checkpoint', entityId: id, summary: row.name });
    res.json({ data: serialiseCheckpoint(row) });
  }),
);

adminQcRouter.delete(
  '/checkpoints/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.qcCheckpoint.findUnique({
      where: { id },
      select: { name: true, _count: { select: { results: true } } },
    });
    if (!existing) throw notFound('That checkpoint no longer exists.');

    if (existing._count.results > 0) {
      throw badRequest('Inspections have been recorded against this checkpoint, so it cannot be deleted. Mark it inactive instead — it will stop appearing on new inspections and the history stays intact.');
    }

    await prisma.qcCheckpoint.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'qc checkpoint', entityId: id, summary: existing.name });
    res.status(204).end();
  }),
);

/* ---------------------------------------------------------- inspections -- */

const INCLUDE = {
  results: {
    orderBy: { checkpoint: { displayOrder: 'asc' } },
    include: {
      checkpoint: {
        select: { id: true, name: true, kind: true, unit: true, minValue: true, maxValue: true, critical: true },
      },
    },
  },
  run: { select: { id: true, reference: true, title: true, status: true } },
  order: { select: { id: true, number: true, company: { select: { id: true, name: true } } } },
  stage: { select: { id: true, name: true } },
  inspector: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.QcInspectionInclude;

type Row = Prisma.QcInspectionGetPayload<{ include: typeof INCLUDE }>;

function serialise(i: Row) {
  const results = i.results.map((r) => ({
    ...r,
    value: decimal(r.value),
    checkpoint: {
      ...r.checkpoint,
      minValue: decimal(r.checkpoint.minValue),
      maxValue: decimal(r.checkpoint.maxValue),
    },
  }));

  return {
    ...i,
    results,
    /* The outcome a screen should show: an override wins where one was made,
       and both are returned so a report can say the computed result was
       overruled rather than quietly showing the override alone. */
    outcome: i.overrideResult ?? i.result,
    criticalFailure: hasCriticalFailure(
      i.results.map((r) => ({ passed: r.passed, critical: r.checkpoint.critical })),
    ),
    locked: Boolean(i.completedAt),
  };
}

const reload = async (id: string) =>
  serialise((await prisma.qcInspection.findUnique({ where: { id }, include: INCLUDE })) as Row);

adminQcRouter.get(
  '/inspections',
  asyncHandler(async (req, res) => {
    const q = inspectionListQuery.parse(req.query);

    const and: Prisma.QcInspectionWhereInput[] = [];
    if (q.result) and.push({ result: q.result });
    if (q.runId) and.push({ runId: q.runId });
    if (q.orderId) and.push({ orderId: q.orderId });
    if (q.open) and.push({ completedAt: null });
    if (q.q) {
      and.push({
        OR: [
          { reference: { contains: q.q, mode: 'insensitive' } },
          { run: { reference: { contains: q.q, mode: 'insensitive' } } },
          { run: { title: { contains: q.q, mode: 'insensitive' } } },
          { order: { number: { contains: q.q, mode: 'insensitive' } } },
          { order: { company: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.qcInspection.count({ where }),
      prisma.qcInspection.findMany({
        where,
        orderBy: [{ inspectedAt: 'desc' }],
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

adminQcRouter.get(
  '/inspections/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.qcInspection.findUnique({ where: { id: String(req.params.id) }, include: INCLUDE });
    if (!row) throw notFound('That inspection no longer exists.');
    res.json({ data: serialise(row) });
  }),
);

adminQcRouter.post(
  '/inspections',
  asyncHandler(async (req, res) => {
    const input = inspectionCreateSchema.parse(req.body);

    /* An inspection has to be of something. A record floating free is a
       reading nobody can trace back to a ball. */
    if (!input.runId && !input.orderId) {
      throw badRequest('Say what is being inspected — a production run or an order.');
    }
    if (input.runId) {
      const run = await prisma.productionRun.findUnique({ where: { id: input.runId }, select: { orderId: true } });
      if (!run) throw badRequest('That production run no longer exists.');
      /* Inherit the order, so a final report can be assembled per order
         without walking every run by hand. */
      if (!input.orderId && run.orderId) input.orderId = run.orderId;
    }
    if (input.orderId) {
      const order = await prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true } });
      if (!order) throw badRequest('That order no longer exists.');
    }

    let created: { id: string; reference: string } | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const reference = await nextInspectionReference(attempt);
      try {
        created = await prisma.qcInspection.create({
          data: {
            reference,
            runId: input.runId ?? null,
            orderId: input.orderId ?? null,
            stageId: input.stageId ?? null,
            inspectorId: input.inspectorId ?? req.admin?.id ?? null,
            sampleSize: input.sampleSize,
            quantityPassed: input.quantityPassed,
            quantityFailed: input.quantityFailed,
            inspectedAt: input.inspectedAt ?? new Date(),
            notes: input.notes ?? null,
            createdById: req.admin?.id ?? null,
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
    if (!created) throw conflict('Could not allocate an inspection reference. Please try again.');

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'qc inspection',
      entityId: created.id,
      summary: created.reference,
    });

    res.status(201).json({ data: await reload(created.id) });
  }),
);

adminQcRouter.put(
  '/inspections/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = inspectionUpdateSchema.parse(req.body);

    const existing = await prisma.qcInspection.findUnique({
      where: { id },
      select: { reference: true, completedAt: true },
    });
    if (!existing) throw notFound('That inspection no longer exists.');
    if (existing.completedAt) {
      throw badRequest('This inspection has been completed and cannot be changed. An inspection that can be edited afterwards is not evidence of anything.');
    }

    await prisma.qcInspection.update({
      where: { id },
      data: {
        ...(input.stageId !== undefined ? { stageId: input.stageId || null } : {}),
        ...(input.inspectorId !== undefined ? { inspectorId: input.inspectorId || null } : {}),
        ...(input.sampleSize !== undefined ? { sampleSize: input.sampleSize } : {}),
        ...(input.quantityPassed !== undefined ? { quantityPassed: input.quantityPassed } : {}),
        ...(input.quantityFailed !== undefined ? { quantityFailed: input.quantityFailed } : {}),
        ...(input.inspectedAt !== undefined ? { inspectedAt: input.inspectedAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'qc inspection', entityId: id, summary: existing.reference });
    res.json({ data: await reload(id) });
  }),
);

/**
 * Recording readings.
 *
 * A measurement with limits is judged against them; anything else is the
 * inspector's call and has to say so. Results are replaced wholesale, for the
 * same reason quotation lines are: reconciling which of forty readings moved
 * is more code and more ways to be wrong than writing the set in front of the
 * person.
 */
adminQcRouter.put(
  '/inspections/:id/results',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { results } = resultsSchema.parse(req.body);

    const existing = await prisma.qcInspection.findUnique({
      where: { id },
      select: { reference: true, completedAt: true },
    });
    if (!existing) throw notFound('That inspection no longer exists.');
    if (existing.completedAt) {
      throw badRequest('This inspection has been completed and its readings cannot be changed.');
    }

    const ids = results.map((r) => r.checkpointId);
    if (new Set(ids).size !== ids.length) {
      throw badRequest('The same checkpoint appears twice. A second reading is a correction, not another data point.');
    }

    const checkpoints = await prisma.qcCheckpoint.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, kind: true, minValue: true, maxValue: true, critical: true, active: true },
    });
    const byId = new Map(checkpoints.map((c) => [c.id, c]));

    const rows = results.map((r) => {
      const checkpoint = byId.get(r.checkpointId);
      if (!checkpoint) throw badRequest('One of those checkpoints no longer exists.');
      if (!checkpoint.active) {
        throw badRequest(`${checkpoint.name} is retired and cannot be added to a new inspection.`);
      }
      if (checkpoint.kind === 'MEASUREMENT' && r.value == null && r.passed === undefined) {
        throw badRequest(`${checkpoint.name} is a measurement — record a reading, or say whether it passed.`);
      }

      const verdict = judge(checkpoint, r.value ?? null, r.passed ?? null);
      return {
        inspectionId: id,
        checkpointId: r.checkpointId,
        value: r.value ?? null,
        passed: verdict.passed,
        /* The inspector's own words win; the computed explanation only fills
           in when they did not give one. */
        note: r.note ?? verdict.reason,
      };
    });

    await prisma.$transaction([
      prisma.qcResult.deleteMany({ where: { inspectionId: id } }),
      prisma.qcResult.createMany({ data: rows }),
    ]);

    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'qc inspection',
      entityId: id,
      summary: `${existing.reference} — ${rows.length} readings`,
    });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Completing an inspection.
 *
 * The outcome is computed from the readings, then the record is locked. A
 * failed inspection is not softened here: letting one through is a separate,
 * named decision.
 */
adminQcRouter.post(
  '/inspections/:id/complete',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = completeSchema.parse(req.body);

    const existing = await prisma.qcInspection.findUnique({
      where: { id },
      include: { results: { include: { checkpoint: { select: { critical: true } } } } },
    });
    if (!existing) throw notFound('That inspection no longer exists.');
    if (existing.completedAt) throw badRequest('This inspection has already been completed.');
    if (!existing.results.length) {
      throw badRequest('Record at least one reading before completing the inspection — an inspection with nothing in it says nothing.');
    }

    const lines = existing.results.map((r) => ({ passed: r.passed, critical: r.checkpoint.critical }));
    const result = summarise(lines);

    await prisma.qcInspection.update({
      where: { id },
      data: {
        result,
        completedAt: new Date(),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
    });

    /* A failed inspection is not allowed to pass quietly, and a passed one
       moves the order on. Both only nudge an order that is actually waiting
       on this: nothing is dragged backwards. */
    if (result === 'PASSED' && existing.orderId) {
      const order = await prisma.order.findUnique({ where: { id: existing.orderId }, select: { status: true } });
      if (order?.status === 'QUALITY_CHECK') {
        await prisma.$transaction([
          prisma.order.update({ where: { id: existing.orderId }, data: { status: 'READY_TO_SHIP' } }),
          prisma.orderEvent.create({
            data: {
              orderId: existing.orderId,
              fromStatus: 'QUALITY_CHECK',
              toStatus: 'READY_TO_SHIP',
              byUserId: req.admin?.id ?? null,
              note: `Inspection ${existing.reference} passed`,
            },
          }),
        ]);
      }
    }

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'qc inspection',
      entityId: id,
      summary: `${existing.reference}: ${result}`,
    });

    res.json({ data: await reload(id) });
  }),
);

/**
 * Overruling the computed outcome.
 *
 * This is how a batch that failed on something minor gets shipped anyway —
 * with a reason and a name against it. A critical failure cannot be waved
 * through: that is what marking a checkpoint critical was for.
 */
adminQcRouter.post(
  '/inspections/:id/override',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = overrideSchema.parse(req.body);

    const existing = await prisma.qcInspection.findUnique({
      where: { id },
      include: { results: { include: { checkpoint: { select: { critical: true, name: true } } } } },
    });
    if (!existing) throw notFound('That inspection no longer exists.');
    if (!existing.completedAt) {
      throw badRequest('Complete the inspection first. There is no outcome to overrule yet.');
    }

    const critical = existing.results.filter((r) => !r.passed && r.checkpoint.critical);
    if (critical.length && input.result !== 'FAILED') {
      throw badRequest(`${critical.map((c) => c.checkpoint.name).join(', ')} failed, and ${critical.length === 1 ? 'that checkpoint is' : 'those checkpoints are'} marked critical. A critical failure cannot be passed or conceded.`);
    }

    await prisma.qcInspection.update({
      where: { id },
      data: {
        overrideResult: input.result,
        overrideReason: input.reason,
        decidedById: req.admin?.id ?? null,
      },
    });

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'qc inspection',
      entityId: id,
      summary: `${existing.reference}: ${existing.result} overruled to ${input.result}`,
    });

    res.json({ data: await reload(id) });
  }),
);

adminQcRouter.delete(
  '/inspections/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.qcInspection.findUnique({
      where: { id },
      select: { reference: true, completedAt: true },
    });
    if (!existing) throw notFound('That inspection no longer exists.');

    if (existing.completedAt) {
      throw badRequest('A completed inspection is a record of what was found and cannot be deleted.');
    }

    await prisma.qcInspection.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'qc inspection', entityId: id, summary: existing.reference });
    res.status(204).end();
  }),
);
