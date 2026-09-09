/**
 * Copilot tools — the factory side.
 *
 * Production, quality and stock, all read-only. Each one reports what the
 * records actually hold: progress from recorded output rather than from the
 * stage a run is parked in, stock from the ledger rather than a stored
 * number, and quality from readings rather than from an impression. Those are
 * the same rules the screens follow, reused from the same libraries so an
 * answer here and a screen there cannot disagree.
 */
import { z } from 'zod';
import { prisma } from '../../../db';
import { progressOf } from '../../../lib/production';
import { levelOf } from '../../../lib/stock';
import { compact } from '../../tools/types';
import type { AITool } from '../../tools/types';

const RUN_STATUS = ['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;
const SHIPMENT_STATUS = ['PREPARING', 'READY', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const;

const window = z.coerce.number().int().min(1).max(365).default(30);
const since = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/* ----------------------------------------------------------- production -- */

const productionSchema = z.object({
  status: z.enum(RUN_STATUS).optional(),
  late: z.boolean().optional(),
  query: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const productionStatus: AITool<z.infer<typeof productionSchema>> = {
  definition: {
    name: 'production_status',
    description:
      'What the factory is making: production runs with how far along each one is, which stage it is at, and whether it is past its date. Progress is counted from output that was recorded, not from the stage a run is sitting in. Use this for any question about what is being made or what is running late on the floor.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...RUN_STATUS] },
        late: { type: 'boolean', description: 'Only runs past their date that are not finished.' },
        query: { type: 'string', description: 'Run reference, what is being made, order number or customer.' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
  },
  schema: productionSchema,
  async run(input) {
    const and: Record<string, unknown>[] = [];
    if (input.status) and.push({ status: input.status });
    if (input.late) {
      and.push({ plannedEnd: { lt: new Date() }, status: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] } });
    }
    if (input.query) {
      and.push({
        OR: [
          { reference: { contains: input.query, mode: 'insensitive' } },
          { title: { contains: input.query, mode: 'insensitive' } },
          { order: { number: { contains: input.query, mode: 'insensitive' } } },
          { order: { company: { name: { contains: input.query, mode: 'insensitive' } } } },
        ],
      });
    }

    const runs = await prisma.productionRun.findMany({
      where: and.length ? { AND: and as never } : {},
      orderBy: [{ plannedEnd: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: input.limit,
      select: {
        reference: true, title: true, status: true, quantityPlanned: true,
        plannedEnd: true, actualStart: true,
        currentStage: { select: { name: true } },
        outputs: { select: { quantityGood: true, quantityRejected: true } },
        order: { select: { number: true, company: { select: { name: true } } } },
      },
    });

    const stages = await prisma.productionStage.count({ where: { active: true } });

    return {
      found: runs.length,
      runs: runs.map((r) => {
        const progress = progressOf(r.quantityPlanned, r.outputs);
        return compact({
          reference: r.reference,
          what: r.title,
          status: r.status,
          stage: r.currentStage?.name,
          forOrder: r.order?.number,
          customer: r.order?.company?.name,
          planned: progress.planned,
          madeAndPassed: progress.good,
          rejected: progress.rejected,
          stillToMake: progress.remaining,
          percentComplete: progress.percent,
          rejectRatePercent: progress.rejected > 0 ? progress.rejectRate : undefined,
          due: r.plannedEnd?.toISOString().slice(0, 10),
          started: r.actualStart?.toISOString().slice(0, 10),
        });
      }),
      note: stages === 0
        ? 'No production stages have been defined yet, so runs cannot say where they are. Mention this if the question was about stages.'
        : runs.length === 0
          ? 'Nothing matches. Say so plainly.'
          : undefined,
    };
  },
};

/* -------------------------------------------------------------- quality -- */

const qualitySchema = z.object({
  days: window,
  onlyFailures: z.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const qualitySummary: AITool<z.infer<typeof qualitySchema>> = {
  definition: {
    name: 'quality_summary',
    description:
      'Inspections over a period: how many passed, how many failed, how many were let through on a concession, and which failures nobody has decided about yet. A concession means it failed and somebody let it through — never report one as a pass. Use this for any question about quality.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 365 },
        onlyFailures: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
  },
  schema: qualitySchema,
  async run(input) {
    const from = since(input.days);

    const [counts, undecided, checkpoints, recent] = await Promise.all([
      prisma.qcInspection.groupBy({
        by: ['result'],
        where: { inspectedAt: { gte: from }, NOT: { completedAt: null } },
        _count: { _all: true },
      }),
      prisma.qcInspection.count({
        where: { result: 'FAILED', overrideResult: null, NOT: { completedAt: null } },
      }),
      prisma.qcCheckpoint.count({ where: { active: true } }),
      prisma.qcInspection.findMany({
        where: {
          inspectedAt: { gte: from },
          ...(input.onlyFailures ? { result: 'FAILED' } : {}),
        },
        orderBy: { inspectedAt: 'desc' },
        take: input.limit,
        select: {
          reference: true, result: true, overrideResult: true, overrideReason: true,
          sampleSize: true, quantityFailed: true, completedAt: true, inspectedAt: true,
          run: { select: { reference: true, title: true } },
          order: { select: { number: true } },
          results: {
            where: { passed: false },
            select: { note: true, checkpoint: { select: { name: true, critical: true } } },
          },
        },
      }),
    ]);

    const tally = Object.fromEntries(counts.map((c) => [c.result, c._count._all]));

    return {
      periodDays: input.days,
      completedInspections: counts.reduce((sum, c) => sum + c._count._all, 0),
      passed: tally.PASSED ?? 0,
      failed: tally.FAILED ?? 0,
      failuresWithNoDecision: undecided,
      inspections: recent.map((i) =>
        compact({
          reference: i.reference,
          outcome: i.overrideResult ?? i.result,
          scoredBeforeAnyOverride: i.overrideResult ? i.result : undefined,
          concessionReason: i.overrideReason,
          forRun: i.run?.reference,
          making: i.run?.title,
          forOrder: i.order?.number,
          sample: i.sampleSize,
          unitsFailed: i.quantityFailed || undefined,
          completed: i.completedAt?.toISOString().slice(0, 10),
          failedOn: i.results.map((r) =>
            compact({ checkpoint: r.checkpoint.name, critical: r.checkpoint.critical || undefined, why: r.note }),
          ),
        }),
      ),
      note: checkpoints === 0
        ? 'No QC checkpoints have been defined yet, so nothing can be inspected. Mention this if it is relevant.'
        : 'A concession is a failure that was let through, not a pass. Report it as such.',
    };
  },
};

/* ---------------------------------------------------------------- stock -- */

const stockSchema = z.object({
  query: z.string().trim().max(120).optional(),
  lowOnly: z.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(40).default(20),
});

export const stockLevels: AITool<z.infer<typeof stockSchema>> = {
  definition: {
    name: 'stock_levels',
    description:
      'What is on hand. Levels are the sum of the recorded movements, so they always match the ledger. Reports which items are at or below their reorder level, and which show less than nothing — that last case means the count is wrong, not that there is a shortage. Only items with a reorder level set are ever described as low.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Item name or code.' },
        lowOnly: { type: 'boolean', description: 'Only items at or below their reorder level.' },
        limit: { type: 'integer', minimum: 1, maximum: 40 },
      },
    },
  },
  schema: stockSchema,
  async run(input) {
    const items = await prisma.stockItem.findMany({
      where: {
        active: true,
        ...(input.query
          ? {
              OR: [
                { name: { contains: input.query, mode: 'insensitive' } },
                { sku: { contains: input.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      take: input.lowOnly ? 200 : input.limit,
      select: {
        name: true, sku: true, kind: true, unit: true, reorderLevel: true,
        movements: { select: { quantity: true } },
      },
    });

    let rows = items.map((i) => {
      const level = levelOf(i.movements, i.reorderLevel);
      return compact({
        code: i.sku,
        name: i.name,
        kind: i.kind,
        unit: i.unit,
        onHand: level.onHand,
        reorderLevel: level.reorderLevel ?? undefined,
        needsOrdering: level.low || undefined,
        countIsWrong: level.negative || undefined,
      });
    });

    if (input.lowOnly) rows = rows.filter((r) => r.needsOrdering).slice(0, input.limit);

    const noLevelSet = items.filter((i) => i.reorderLevel === null).length;

    return {
      found: rows.length,
      items: rows,
      itemsWithNoReorderLevel: noLevelSet,
      note: rows.some((r) => r.countIsWrong)
        ? 'An item showing less than nothing means something was issued that was never recorded as received. That is a count to correct, not a shortage to order against.'
        : noLevelSet > 0
          ? `${noLevelSet} items have no reorder level set and are therefore never flagged as low. Do not describe them as adequately stocked.`
          : undefined,
    };
  },
};

/* ------------------------------------------------------------- shipping -- */

const shippingSchema = z.object({
  status: z.enum(SHIPMENT_STATUS).optional(),
  overdue: z.boolean().optional(),
  query: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const shippingStatus: AITool<z.infer<typeof shippingSchema>> = {
  definition: {
    name: 'shipping_status',
    description:
      'Consignments: what has gone, what is packed and waiting, and what should have arrived and has not. An order can go in several shipments, so a shipment covering part of an order is normal. Use this for questions about deliveries and tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...SHIPMENT_STATUS] },
        overdue: { type: 'boolean', description: 'Only shipments past their expected date that are not delivered.' },
        query: { type: 'string', description: 'Shipment reference, tracking number, order number or customer.' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
  },
  schema: shippingSchema,
  async run(input) {
    const and: Record<string, unknown>[] = [];
    if (input.status) and.push({ status: input.status });
    if (input.overdue) {
      and.push({ expectedAt: { lt: new Date() }, status: { notIn: ['DELIVERED', 'CANCELLED'] } });
    }
    if (input.query) {
      and.push({
        OR: [
          { reference: { contains: input.query, mode: 'insensitive' } },
          { trackingNumber: { contains: input.query, mode: 'insensitive' } },
          { carrier: { contains: input.query, mode: 'insensitive' } },
          { order: { number: { contains: input.query, mode: 'insensitive' } } },
          { order: { company: { name: { contains: input.query, mode: 'insensitive' } } } },
        ],
      });
    }

    const shipments = await prisma.shipment.findMany({
      where: and.length ? { AND: and as never } : {},
      orderBy: [{ createdAt: 'desc' }],
      take: input.limit,
      select: {
        reference: true, status: true, carrier: true, service: true, trackingNumber: true,
        packages: true, expectedAt: true, dispatchedAt: true, deliveredAt: true,
        order: { select: { number: true, company: { select: { name: true } } } },
        items: { select: { quantity: true } },
      },
    });

    return {
      found: shipments.length,
      shipments: shipments.map((s) =>
        compact({
          reference: s.reference,
          status: s.status,
          forOrder: s.order.number,
          customer: s.order.company?.name,
          carrier: s.carrier,
          service: s.service,
          tracking: s.trackingNumber,
          packages: s.packages || undefined,
          unitsInThisConsignment: s.items.reduce((sum, i) => sum + i.quantity, 0) || undefined,
          expected: s.expectedAt?.toISOString().slice(0, 10),
          dispatched: s.dispatchedAt?.toISOString().slice(0, 10),
          delivered: s.deliveredAt?.toISOString().slice(0, 10),
        }),
      ),
      note: shipments.length === 0 ? 'Nothing matches. Say so plainly.' : undefined,
    };
  },
};

/* ------------------------------------------------------------- snapshot -- */

const snapshotSchema = z.object({});

export const businessSnapshot: AITool<z.infer<typeof snapshotSchema>> = {
  definition: {
    name: 'business_snapshot',
    description:
      'One call for the state of the business right now: what is late, what is unanswered, what needs a decision. Use this to open a conversation, or when the question is broad — "how are we doing", "what needs attention". Follow it with a specific tool for anything worth digging into.',
    inputSchema: { type: 'object', properties: {} },
  },
  schema: snapshotSchema,
  async run() {
    const now = new Date();

    const [
      openOrders, lateOrders, unansweredRfqs, overdueFollowUps, openLeads,
      runsInProgress, lateRuns, undecidedFailures, openInspections,
      overdueShipments, readyToShip, stockItems, publishedProducts,
    ] = await Promise.all([
      prisma.order.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      prisma.order.count({
        where: {
          promisedAt: { lt: now },
          status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP', 'ON_HOLD'] },
        },
      }),
      prisma.quoteRequest.count({ where: { status: 'NEW' } }),
      prisma.lead.count({ where: { closedAt: null, nextFollowUpAt: { lt: now } } }),
      prisma.lead.count({ where: { closedAt: null } }),
      prisma.productionRun.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.productionRun.count({
        where: { plannedEnd: { lt: now }, status: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] } },
      }),
      prisma.qcInspection.count({ where: { result: 'FAILED', overrideResult: null, NOT: { completedAt: null } } }),
      prisma.qcInspection.count({ where: { completedAt: null } }),
      prisma.shipment.count({ where: { expectedAt: { lt: now }, status: { notIn: ['DELIVERED', 'CANCELLED'] } } }),
      prisma.shipment.count({ where: { status: 'READY' } }),
      prisma.stockItem.findMany({
        where: { active: true },
        select: { reorderLevel: true, movements: { select: { quantity: true } } },
      }),
      prisma.product.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
    ]);

    const levels = stockItems.map((i) => levelOf(i.movements, i.reorderLevel));

    return {
      asOf: now.toISOString().slice(0, 10),
      sales: {
        openOrders,
        ordersPastPromisedDate: lateOrders,
        quoteRequestsUnanswered: unansweredRfqs,
        openOpportunities: openLeads,
        followUpsOverdue: overdueFollowUps,
      },
      factory: {
        runsInProgress,
        runsPastTheirDate: lateRuns,
        inspectionsNotCompleted: openInspections,
        failedInspectionsWithNoDecision: undecidedFailures,
      },
      stock: {
        itemsTracked: stockItems.length,
        atOrBelowReorderLevel: levels.filter((l) => l.low).length,
        showingLessThanNothing: levels.filter((l) => l.negative).length,
      },
      shipping: { packedAndWaiting: readyToShip, shouldHaveArrived: overdueShipments },
      catalogue: { publishedProducts },
      note: 'Every figure here is counted from records. A zero is a real zero — it does not mean a module is switched off.',
    };
  },
};
