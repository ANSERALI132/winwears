/**
 * The RFQ command centre.
 *
 * A view over quote requests, joined to the account and the opportunity they
 * belong to. There is no separate RFQ pipeline: the workflow lives on the
 * lead, because §12's stages and the lead's stages are the same ten steps,
 * and two pipelines over one deal is two pipelines that disagree.
 *
 * What lives here instead is everything about *handling* the request —
 * who has it, how urgent somebody decided it is, and when to chase it.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { pagination, optionalText } from '../../validation/common';

export const adminRfqRouter = Router();

adminRfqRouter.use(csrfProtection);

const rfqPriority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const quoteStatus = z.enum(['NEW', 'CONTACTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']);
const leadStage = z.enum([
  'NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY', 'RFQ',
  'QUOTATION', 'NEGOTIATION', 'SAMPLE', 'WON', 'LOST',
]);

const listQuery = pagination.extend({
  q: optionalText(200),
  status: quoteStatus.optional(),
  priority: rfqPriority.optional(),
  stage: leadStage.optional(),
  country: optionalText(80),
  assignedToId: optionalText(64),
  source: z.enum(['WEBSITE_FORM', 'AI_AGENT']).optional(),
  /** `yes` for requests nobody has picked up. */
  unassigned: z.enum(['yes', 'no']).optional(),
  /** `yes` for requests whose follow-up date has passed. */
  overdue: z.enum(['yes', 'no']).optional(),
  sort: z.enum(['newest', 'oldest', 'priority', 'followup']).default('newest'),
});

const RFQ_INCLUDE = {
  product: { select: { id: true, productName: true, slug: true } },
  companyAccount: { select: { id: true, name: true, segment: true, country: true } },
  contactPerson: { select: { id: true, name: true, email: true, whatsapp: true } },
  assignedTo: { select: { id: true, name: true } },
  lead: {
    select: {
      id: true, reference: true, stage: true, score: true, scoreOverride: true,
      owner: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.QuoteRequestInclude;

function orderFor(sort: string): Prisma.QuoteRequestOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'priority':
      /* Postgres orders an enum by its declaration order, and RfqPriority is
         declared low to urgent — so descending puts URGENT first. */
      return [{ priority: 'desc' }, { createdAt: 'asc' }];
    case 'followup':
      return [{ followUpAt: 'asc' }, { createdAt: 'asc' }];
    default:
      return [{ createdAt: 'desc' }];
  }
}

adminRfqRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const now = new Date();

    const and: Prisma.QuoteRequestWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.priority) and.push({ priority: q.priority });
    if (q.source) and.push({ source: q.source });
    if (q.stage) and.push({ lead: { stage: q.stage } });
    if (q.country) and.push({ country: { contains: q.country, mode: 'insensitive' } });
    if (q.assignedToId) and.push({ assignedToId: q.assignedToId });
    if (q.unassigned === 'yes') and.push({ assignedToId: null });
    if (q.overdue === 'yes') and.push({ followUpAt: { lt: now }, status: { notIn: ['COMPLETED', 'ARCHIVED'] } });
    if (q.q) {
      and.push({
        OR: [
          { reference: { contains: q.q, mode: 'insensitive' } },
          { name: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
          { company: { contains: q.q, mode: 'insensitive' } },
          { country: { contains: q.q, mode: 'insensitive' } },
          { message: { contains: q.q, mode: 'insensitive' } },
          { companyAccount: { name: { contains: q.q, mode: 'insensitive' } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows, counts] = await Promise.all([
      prisma.quoteRequest.count({ where }),
      prisma.quoteRequest.findMany({
        where,
        orderBy: orderFor(q.sort),
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: RFQ_INCLUDE,
      }),
      /* The header figures, always over everything rather than the current
         filter — a filtered view should not change what "12 waiting" means. */
      Promise.all([
        prisma.quoteRequest.count({ where: { status: 'NEW' } }),
        prisma.quoteRequest.count({ where: { assignedToId: null, status: { notIn: ['COMPLETED', 'ARCHIVED'] } } }),
        prisma.quoteRequest.count({ where: { followUpAt: { lt: now }, status: { notIn: ['COMPLETED', 'ARCHIVED'] } } }),
        prisma.quoteRequest.count({ where: { priority: { in: ['HIGH', 'URGENT'] }, status: { notIn: ['COMPLETED', 'ARCHIVED'] } } }),
      ]),
    ]);

    res.json({
      data: rows,
      meta: {
        page: q.page, perPage: q.perPage, total,
        totalPages: Math.max(1, Math.ceil(total / q.perPage)),
        summary: { unactioned: counts[0], unassigned: counts[1], overdue: counts[2], highPriority: counts[3] },
      },
    });
  }),
);

adminRfqRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const rfq = await prisma.quoteRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        ...RFQ_INCLUDE,
        aiConversation: { select: { id: true, messageCount: true, leadScore: true } },
      },
    });
    if (!rfq) throw notFound('That request no longer exists.');
    res.json({ data: rfq });
  }),
);

const handleSchema = z.object({
  status: quoteStatus.optional(),
  priority: rfqPriority.optional(),
  assignedToId: z.string().trim().max(64).nullish(),
  followUpAt: z.coerce.date().nullish(),
  internalNotes: z.string().trim().max(8000).nullish(),
});

adminRfqRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = handleSchema.parse(req.body);

    const existing = await prisma.quoteRequest.findUnique({
      where: { id },
      select: { status: true, priority: true, assignedToId: true, reference: true },
    });
    if (!existing) throw notFound('That request no longer exists.');

    if (input.assignedToId) {
      const user = await prisma.user.findFirst({
        where: { id: input.assignedToId, active: true },
        select: { id: true },
      });
      if (!user) throw notFound('That team member no longer has an account.');
    }

    const rfq = await prisma.quoteRequest.update({
      where: { id },
      data: { ...input, lastActivityAt: new Date() },
      include: RFQ_INCLUDE,
    });

    /* Only the decisions worth reconstructing later. An internal note being
       edited is not one; who a request was handed to is. */
    const changes: string[] = [];
    if (input.status && input.status !== existing.status) changes.push(`status ${existing.status} → ${input.status}`);
    if (input.priority && input.priority !== existing.priority) changes.push(`priority ${existing.priority} → ${input.priority}`);
    if (input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId) {
      changes.push(input.assignedToId ? `assigned to ${rfq.assignedTo?.name ?? 'someone'}` : 'unassigned');
    }
    if (changes.length) {
      await log({
        adminId: req.admin?.id,
        action: 'status_changed',
        entity: 'rfq',
        entityId: id,
        summary: `${existing.reference ?? id.slice(-8)}: ${changes.join(', ')}`,
      });
    }

    res.json({ data: rfq });
  }),
);

/** Who a request can be handed to. Active accounts only — assigning work to
 *  a disabled account is a request nobody will ever see. */
adminRfqRouter.get(
  '/meta/assignees',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });
    res.json({ data: users });
  }),
);
