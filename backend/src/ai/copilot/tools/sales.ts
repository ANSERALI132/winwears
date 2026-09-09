/**
 * Copilot tools — the commercial side.
 *
 * Every tool here is a lookup. None of them writes anything, and that is the
 * boundary the whole Copilot is built on: an assistant that can cancel an
 * order on a misread question is a different class of risk from one that can
 * only be wrong out loud.
 *
 * The rule that bites hardest in this file is currency. A quotation to a UK
 * club and one to a Gulf distributor are in different currencies, and adding
 * them produces a number that is not money. Everything is grouped by currency
 * and reported per currency, never totalled across them.
 */
import { z } from 'zod';
import { prisma } from '../../../db';
import { decimalToNumber } from '../../../lib/quotation';
import { balanceOf } from '../../../lib/order';
import { compact } from '../../tools/types';
import type { AITool } from '../../tools/types';

const ORDER_STATUS = [
  'CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP',
  'SHIPPED', 'DELIVERED', 'COMPLETED', 'ON_HOLD', 'CANCELLED',
] as const;

/** Days back, for anything time-boxed. Capped so one question cannot pull the
 *  whole history into a prompt. */
const window = z.coerce.number().int().min(1).max(365).default(30);

const since = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Money grouped by its own currency, because a total across currencies is
 *  not a total. */
function byCurrency(rows: Array<{ currency: string; total: unknown }>): Record<string, { count: number; total: number }> {
  const out: Record<string, { count: number; total: number }> = {};
  for (const row of rows) {
    const key = row.currency || 'UNKNOWN';
    const bucket = out[key] ?? { count: 0, total: 0 };
    /* Whole minor units, then back once — the same reason the quotation
       arithmetic does it, and a report a penny out is a report somebody
       queries. */
    bucket.total = Math.round(bucket.total * 100 + decimalToNumber(row.total as never) * 100) / 100;
    bucket.count += 1;
    out[key] = bucket;
  }
  return out;
}

/* ---------------------------------------------------------------- orders -- */

const searchOrdersSchema = z.object({
  query: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUS).optional(),
  late: z.boolean().optional(),
  unpaid: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const searchOrders: AITool<z.infer<typeof searchOrdersSchema>> = {
  definition: {
    name: 'search_orders',
    description:
      'Find orders by customer name, order number, purchase order number, status, whether they are past the promised date, or whether money is still outstanding. Returns the order number, customer, total, what is owed, status and dates. Use this for any question about what has been sold, what is late, or what is unpaid.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Customer name, order number or their PO number.' },
        status: { type: 'string', enum: [...ORDER_STATUS] },
        late: { type: 'boolean', description: 'Only orders past the promised date that have not shipped.' },
        unpaid: { type: 'boolean', description: 'Only orders with money still outstanding.' },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
    },
  },
  schema: searchOrdersSchema,
  async run(input) {
    const and: Record<string, unknown>[] = [];
    if (input.status) and.push({ status: input.status });
    if (input.late) {
      and.push({
        promisedAt: { lt: new Date() },
        status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP', 'ON_HOLD'] },
      });
    }
    if (input.query) {
      and.push({
        OR: [
          { number: { contains: input.query, mode: 'insensitive' } },
          { poNumber: { contains: input.query, mode: 'insensitive' } },
          { company: { name: { contains: input.query, mode: 'insensitive' } } },
        ],
      });
    }

    const rows = await prisma.order.findMany({
      where: and.length ? { AND: and as never } : {},
      orderBy: [{ createdAt: 'desc' }],
      take: input.unpaid ? 50 : input.limit,
      select: {
        number: true, status: true, currency: true, total: true, poNumber: true,
        promisedAt: true, requiredBy: true, confirmedAt: true,
        company: { select: { name: true, country: true } },
        payments: { select: { amount: true } },
      },
    });

    let orders = rows.map((o) => {
      const balance = balanceOf(o.total, o.payments);
      return compact({
        number: o.number,
        customer: o.company?.name,
        country: o.company?.country,
        theirPoNumber: o.poNumber,
        status: o.status,
        currency: o.currency,
        total: balance.total,
        paid: balance.paid,
        outstanding: balance.balance,
        promised: o.promisedAt?.toISOString().slice(0, 10),
        customerNeedsBy: o.requiredBy?.toISOString().slice(0, 10),
        confirmed: o.confirmedAt.toISOString().slice(0, 10),
      });
    });

    if (input.unpaid) orders = orders.filter((o) => (o.outstanding as number) > 0).slice(0, input.limit);

    return {
      found: orders.length,
      orders,
      note: orders.length === 0 ? 'No orders match that. Say so plainly rather than guessing.' : undefined,
    };
  },
};

const getOrderSchema = z.object({
  number: z.string().trim().min(1).max(40),
});

export const getOrder: AITool<z.infer<typeof getOrderSchema>> = {
  definition: {
    name: 'get_order',
    description:
      'Everything recorded about one order by its number (for example WW-SO-2026-0001): its lines, payments, production runs, inspections and shipments. Use this when somebody asks about a specific order rather than a list.',
    inputSchema: {
      type: 'object',
      properties: { number: { type: 'string', description: 'The order number.' } },
      required: ['number'],
    },
  },
  schema: getOrderSchema,
  async run(input) {
    const order = await prisma.order.findFirst({
      where: { number: { equals: input.number.trim(), mode: 'insensitive' } },
      include: {
        company: { select: { name: true, country: true } },
        contact: { select: { name: true, email: true } },
        items: { orderBy: { displayOrder: 'asc' } },
        payments: { orderBy: { receivedAt: 'desc' } },
        runs: { select: { reference: true, title: true, status: true, quantityPlanned: true } },
        shipments: {
          select: { reference: true, status: true, carrier: true, trackingNumber: true, dispatchedAt: true },
        },
        inspections: { select: { reference: true, result: true, overrideResult: true, completedAt: true } },
      },
    });

    if (!order) {
      return { found: false, note: `No order numbered "${input.number}". Say it was not found rather than describing one that might exist.` };
    }

    const balance = balanceOf(order.total, order.payments);

    return compact({
      found: true,
      number: order.number,
      status: order.status,
      customer: order.company?.name,
      contact: order.contact?.name,
      theirPoNumber: order.poNumber,
      currency: order.currency,
      total: balance.total,
      paid: balance.paid,
      outstanding: balance.balance,
      paymentTerms: order.paymentTerms,
      promised: order.promisedAt?.toISOString().slice(0, 10),
      customerNeedsBy: order.requiredBy?.toISOString().slice(0, 10),
      lines: order.items.map((i) =>
        compact({
          description: i.description,
          quantity: i.quantity,
          unitPrice: decimalToNumber(i.unitPrice),
          lineTotal: decimalToNumber(i.lineTotal),
        }),
      ),
      payments: order.payments.map((p) =>
        compact({
          amount: decimalToNumber(p.amount),
          method: p.method,
          reference: p.reference,
          received: p.receivedAt.toISOString().slice(0, 10),
        }),
      ),
      productionRuns: order.runs.map((r) =>
        compact({ reference: r.reference, what: r.title, status: r.status, planned: r.quantityPlanned }),
      ),
      inspections: order.inspections.map((i) =>
        compact({ reference: i.reference, outcome: i.overrideResult ?? i.result, completed: i.completedAt?.toISOString().slice(0, 10) }),
      ),
      shipments: order.shipments.map((s) =>
        compact({
          reference: s.reference,
          status: s.status,
          carrier: s.carrier,
          tracking: s.trackingNumber,
          dispatched: s.dispatchedAt?.toISOString().slice(0, 10),
        }),
      ),
    });
  },
};

/* -------------------------------------------------------------- revenue -- */

const revenueSchema = z.object({
  days: window,
  includeCancelled: z.boolean().default(false),
});

export const revenueSummary: AITool<z.infer<typeof revenueSchema>> = {
  definition: {
    name: 'revenue_summary',
    description:
      'Order value confirmed over a period, and what has actually been paid, both broken down by currency. Use this for questions about how much has been sold or collected. Never add the currencies together — they are reported separately because a total across currencies is not money.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 365, description: 'How many days back. Defaults to 30.' },
        includeCancelled: { type: 'boolean' },
      },
    },
  },
  schema: revenueSchema,
  async run(input) {
    const from = since(input.days);

    const orders = await prisma.order.findMany({
      where: {
        confirmedAt: { gte: from },
        ...(input.includeCancelled ? {} : { status: { not: 'CANCELLED' } }),
      },
      select: { currency: true, total: true, payments: { select: { amount: true } } },
    });

    const sold = byCurrency(orders);
    const collected: Record<string, number> = {};
    for (const order of orders) {
      const paid = order.payments.reduce((sum, p) => sum + Math.round(decimalToNumber(p.amount) * 100), 0);
      collected[order.currency] = Math.round((collected[order.currency] ?? 0) * 100 + paid) / 100;
    }

    return {
      periodDays: input.days,
      from: from.toISOString().slice(0, 10),
      orderCount: orders.length,
      byCurrency: Object.entries(sold).map(([currency, v]) => ({
        currency,
        orders: v.count,
        orderValue: v.total,
        received: collected[currency] ?? 0,
        outstanding: Math.round((v.total - (collected[currency] ?? 0)) * 100) / 100,
      })),
      note: orders.length === 0
        ? 'No orders were confirmed in that period. Say so rather than reaching for a longer period unasked.'
        : 'These are per currency. Do not add them together.',
    };
  },
};

/* ------------------------------------------------------------- pipeline -- */

const pipelineSchema = z.object({ days: window });

export const pipelineSummary: AITool<z.infer<typeof pipelineSchema>> = {
  definition: {
    name: 'pipeline_summary',
    description:
      'The sales pipeline: how many open opportunities sit at each stage, how many quote requests arrived, how many are unanswered, and which follow-ups are overdue. Use this for questions about what is coming in and what needs chasing.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 365 } },
    },
  },
  schema: pipelineSchema,
  async run(input) {
    const from = since(input.days);
    const now = new Date();

    const [stages, newRfqs, unansweredRfqs, overdueFollowUps, unowned, quotations] = await Promise.all([
      prisma.lead.groupBy({ by: ['stage'], where: { closedAt: null }, _count: { _all: true } }),
      prisma.quoteRequest.count({ where: { createdAt: { gte: from } } }),
      prisma.quoteRequest.count({ where: { status: 'NEW' } }),
      prisma.lead.count({ where: { closedAt: null, nextFollowUpAt: { lt: now } } }),
      prisma.lead.count({ where: { closedAt: null, ownerId: null } }),
      prisma.quotation.findMany({
        where: { status: 'SENT', createdAt: { gte: from } },
        select: { currency: true, total: true },
      }),
    ]);

    return {
      periodDays: input.days,
      openOpportunitiesByStage: Object.fromEntries(stages.map((s) => [s.stage, s._count._all])),
      quoteRequestsInPeriod: newRfqs,
      quoteRequestsUnanswered: unansweredRfqs,
      followUpsOverdue: overdueFollowUps,
      opportunitiesWithNoOwner: unowned,
      quotationsSentInPeriod: Object.entries(byCurrency(quotations)).map(([currency, v]) => ({
        currency, count: v.count, value: v.total,
      })),
      note: 'Quotation values are per currency and must not be added together. A sent quotation is an offer, not revenue.',
    };
  },
};

/* ------------------------------------------------------------ customers -- */

const findCustomerSchema = z.object({
  query: z.string().trim().min(1).max(120),
});

export const findCustomer: AITool<z.infer<typeof findCustomerSchema>> = {
  definition: {
    name: 'find_customer',
    description:
      'Look up a customer account by name, with their contacts, open opportunities, orders and what they owe. Use this when a question names a company or a person.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Company or contact name.' } },
      required: ['query'],
    },
  },
  schema: findCustomerSchema,
  async run(input) {
    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: input.query, mode: 'insensitive' } },
          { contacts: { some: { name: { contains: input.query, mode: 'insensitive' } } } },
        ],
      },
      take: 5,
      include: {
        contacts: { select: { name: true, jobTitle: true, email: true, isPrimary: true }, take: 10 },
        leads: { where: { closedAt: null }, select: { reference: true, title: true, stage: true } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { number: true, status: true, currency: true, total: true, payments: { select: { amount: true } } },
        },
      },
    });

    if (!companies.length) {
      return { found: 0, note: `No customer matches "${input.query}". Say so rather than describing one that might exist.` };
    }

    return {
      found: companies.length,
      customers: companies.map((c) =>
        compact({
          name: c.name,
          country: c.country,
          segment: c.segment,
          lastContact: c.lastContactAt?.toISOString().slice(0, 10),
          contacts: c.contacts.map((p) => compact({ name: p.name, role: p.jobTitle, email: p.email, primary: p.isPrimary || undefined })),
          openOpportunities: c.leads.map((l) => compact({ reference: l.reference, title: l.title, stage: l.stage })),
          orders: c.orders.map((o) => {
            const balance = balanceOf(o.total, o.payments);
            return compact({
              number: o.number, status: o.status, currency: o.currency,
              total: balance.total, outstanding: balance.balance,
            });
          }),
        }),
      ),
    };
  },
};
