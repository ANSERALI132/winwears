/**
 * Admin AI endpoints: conversations, their transcripts, and the summary the
 * dashboard opens on.
 *
 * Transcripts contain whatever a customer typed, which is personal data, so
 * everything here sits behind the admin guard applied in ./index and nothing
 * is exposed publicly.
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

export const adminAiRouter = Router();

adminAiRouter.use(csrfProtection);

const leadStatus = z.enum(['NEW', 'QUALIFIED', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED']);
const leadScore = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

const listQuery = pagination.extend({
  q: optionalText(120),
  status: leadStatus.optional(),
  score: leadScore.optional(),
  country: optionalText(80),
  escalated: z.enum(['yes', 'no']).optional(),
  from: optionalText(40),
  to: optionalText(40),
});

/* --------------------------------------------------------------- stats --- */

adminAiRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      total,
      byStatus,
      byScore,
      escalations,
      whatsappClicks,
      quotesFromAi,
      recent,
      knowledgeTotal,
      knowledgePublished,
      tokenSum,
    ] = await Promise.all([
      prisma.aIConversation.count(),
      prisma.aIConversation.groupBy({ by: ['status'], _count: true }),
      prisma.aIConversation.groupBy({ by: ['leadScore'], _count: true }),
      prisma.aIConversation.count({ where: { NOT: { escalatedAt: null } } }),
      prisma.aIEvent.count({ where: { eventType: 'WHATSAPP_CLICKED' } }),
      prisma.quoteRequest.count({ where: { source: 'AI_AGENT' } }),
      prisma.aIConversation.findMany({
        orderBy: { lastMessageAt: 'desc' },
        take: 8,
        select: {
          id: true, customerName: true, company: true, country: true,
          status: true, leadScore: true, quantity: true,
          messageCount: true, lastMessageAt: true, createdAt: true,
        },
      }),
      prisma.aIKnowledge.count(),
      prisma.aIKnowledge.count({ where: { status: 'PUBLISHED' } }),
      prisma.aIConversation.aggregate({ _sum: { tokensUsed: true } }),
    ]);

    /* Why conversations are being handed over. This is the useful number on
       the page: the reasons the agent escalates most are the questions the
       business has not written down yet. */
    const escalationRows = await prisma.aIEvent.findMany({
      where: { eventType: 'HUMAN_ESCALATION', createdAt: { gte: since30 } },
      select: { metadata: true },
      take: 1000,
    });
    const reasons = new Map<string, number>();
    for (const row of escalationRows) {
      const reason = (row.metadata as { reason?: string } | null)?.reason ?? 'unspecified';
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }

    const countOf = <T extends string>(rows: Array<{ _count: number }>, key: string, value: T) =>
      rows.find((r) => (r as unknown as Record<string, string>)[key] === value)?._count ?? 0;

    res.json({
      data: {
        conversations: {
          total,
          new: countOf(byStatus, 'status', 'NEW'),
          qualified: countOf(byStatus, 'status', 'QUALIFIED'),
          contacted: countOf(byStatus, 'status', 'CONTACTED'),
          inProgress: countOf(byStatus, 'status', 'IN_PROGRESS'),
          converted: countOf(byStatus, 'status', 'CONVERTED'),
          closed: countOf(byStatus, 'status', 'CLOSED'),
        },
        leads: {
          low: countOf(byScore, 'leadScore', 'LOW'),
          medium: countOf(byScore, 'leadScore', 'MEDIUM'),
          high: countOf(byScore, 'leadScore', 'HIGH'),
          urgent: countOf(byScore, 'leadScore', 'URGENT'),
        },
        escalations,
        whatsappClicks,
        quotesFromAi,
        /* Conversations that produced a quote request. Only meaningful once
           there are conversations at all, so it is null rather than 0% on an
           empty dashboard. */
        conversionRate: total > 0 ? Math.round((quotesFromAi / total) * 1000) / 10 : null,
        escalationReasons: [...reasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count),
        knowledge: { total: knowledgeTotal, published: knowledgePublished },
        tokensUsed: tokenSum._sum.tokensUsed ?? 0,
        recent,
      },
    });
  }),
);

/* --------------------------------------------------------- conversations - */

adminAiRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);

    const and: Prisma.AIConversationWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.score) and.push({ leadScore: q.score });
    if (q.country) and.push({ country: { contains: q.country, mode: 'insensitive' } });
    if (q.escalated === 'yes') and.push({ NOT: { escalatedAt: null } });
    if (q.escalated === 'no') and.push({ escalatedAt: null });
    if (q.from) and.push({ createdAt: { gte: new Date(q.from) } });
    if (q.to) and.push({ createdAt: { lte: new Date(q.to) } });
    if (q.q) {
      and.push({
        OR: [
          { customerName: { contains: q.q, mode: 'insensitive' } },
          { company: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
          { country: { contains: q.q, mode: 'insensitive' } },
          { requirements: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.aIConversation.count({ where }),
      prisma.aIConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: {
          product: { select: { productName: true, slug: true } },
          category: { select: { name: true } },
          _count: { select: { messages: true, quotes: true } },
        },
      }),
    ]);

    res.json({
      data: rows.map((c) => ({
        ...c,
        /* The session id is a bearer token for that conversation. It is of no
           use in the admin list and every use to anyone who copies it. */
        sessionId: undefined,
        messageCount: c._count.messages,
        quoteCount: c._count.quotes,
      })),
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminAiRouter.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const conversation = await prisma.aIConversation.findUnique({
      where: { id: String(req.params.id) },
      include: {
        product: { select: { productName: true, slug: true, sku: true } },
        category: { select: { name: true } },
        quotes: {
          select: { id: true, reference: true, status: true, createdAt: true, quantity: true },
          orderBy: { createdAt: 'desc' },
        },
        messages: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' }, select: { eventType: true, metadata: true, createdAt: true } },
      },
    });
    if (!conversation) throw notFound('That conversation no longer exists.');

    res.json({
      data: {
        ...conversation,
        sessionId: undefined,
        /* Tool rows carry raw JSON results. Useful for seeing which facts an
           answer was built from, but trimmed so one product search does not
           push the transcript to a megabyte. */
        messages: conversation.messages.map((m) => ({
          ...m,
          content: m.role === 'TOOL' ? m.content.slice(0, 2000) : m.content,
        })),
      },
    });
  }),
);

const statusUpdate = z.object({ status: leadStatus });

adminAiRouter.patch(
  '/conversations/:id/status',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = statusUpdate.parse(req.body);

    const existing = await prisma.aIConversation.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw notFound('That conversation no longer exists.');

    const conversation = await prisma.aIConversation.update({
      where: { id },
      data: { status: input.status },
    });

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'ai_conversation',
      entityId: id,
      summary: `${existing.status} -> ${input.status}`,
    });

    res.json({ data: { ...conversation, sessionId: undefined } });
  }),
);

adminAiRouter.delete(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.aIConversation.findUnique({
      where: { id },
      select: { customerName: true, email: true },
    });
    if (!existing) throw notFound('That conversation no longer exists.');

    /* A hard delete, and deliberately so: this is the mechanism for honouring
       a request to erase personal data. Messages and events cascade. Any
       quote request already raised survives with its link nulled, because
       that is a business record of its own. */
    await prisma.aIConversation.delete({ where: { id } });

    await log({
      adminId: req.admin?.id,
      action: 'deleted',
      entity: 'ai_conversation',
      entityId: id,
      /* The name, not the email: the audit log should show what was removed
         without keeping a copy of the contact details that were removed. */
      summary: existing.customerName ?? 'anonymous conversation',
    });

    res.status(204).end();
  }),
);
