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
import { forbidden, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { getAllSettings, writeSettings } from '../../lib/settings';
import { getAiConfig, getAiEnvironmentFacts, SELECTABLE_MODELS } from '../../lib/aiSettings';
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

/* ------------------------------------------------------------ settings --- */

adminAiRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const [config, settings] = await Promise.all([getAiConfig(), getAllSettings()]);
    res.json({
      data: {
        /* What an admin may change. */
        values: {
          'ai.enabled': settings['ai.enabled'] ?? 'true',
          'ai.greeting': settings['ai.greeting'] ?? '',
          'ai.subtitle': settings['ai.subtitle'] ?? '',
          'ai.escalationMessage': settings['ai.escalationMessage'] ?? '',
          'ai.extraInstructions': settings['ai.extraInstructions'] ?? '',
          'ai.model': settings['ai.model'] ?? '',
          'ai.maxTokens': settings['ai.maxTokens'] ?? '',
        },
        /* What is actually in force once the environment is taken into
           account, so the screen can show the difference rather than imply
           a blank field means "off". */
        effective: {
          enabled: config.enabled,
          model: config.model,
          maxTokens: config.maxTokens,
        },
        models: SELECTABLE_MODELS,
        /* Read-only. Facts about the deployment, never a secret: whether a
           key exists, not what it is. */
        environment: getAiEnvironmentFacts(),
      },
    });
  }),
);

const settingsUpdate = z.object({
  values: z.record(z.string(), z.string().max(8000)),
});

adminAiRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    /* ADMIN only. An EDITOR can write knowledge entries, which are quoted as
       fact — but changing the assistant's instructions, its model or its
       spend per reply is a different kind of decision. */
    if (req.admin?.role !== 'ADMIN') {
      throw forbidden('Only an administrator can change the assistant settings.');
    }

    const input = settingsUpdate.parse(req.body);

    /* Only ai.* keys, whatever was posted: this endpoint must not become a
       second way to rewrite the site's contact details. writeSettings
       already ignores unknown keys; this narrows it to this screen's own. */
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.values)) {
      if (key.startsWith('ai.')) values[key] = value;
    }

    const written = await writeSettings(values);

    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'ai_settings',
      /* Key names, not values — an instruction block does not belong in the
         activity log, and neither does a greeting nobody needs to re-read. */
      summary: written.join(', '),
    });

    const config = await getAiConfig();
    res.json({ data: { written, effective: { enabled: config.enabled, model: config.model, maxTokens: config.maxTokens } } });
  }),
);

/* ----------------------------------------------------------- analytics --- */

interface DayRow { day: Date; count: bigint }
interface SlugRow { slug: string; count: bigint }

const analyticsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

adminAiRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const { days } = analyticsQuery.parse(req.query);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [byType, daily, popular, conversations, withQuote] = await Promise.all([
      prisma.aIEvent.groupBy({
        by: ['eventType'],
        where: { createdAt: { gte: since } },
        _count: true,
      }),

      /* One row per day with at least one message, so the chart shows real
         activity rather than a line drawn through invented zeroes. Gaps are
         filled below, where it is obvious they are gaps. */
      prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', "createdAt") AS day, count(*)::bigint AS count
        FROM "AIEvent"
        WHERE "eventType" = 'MESSAGE_SENT' AND "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,

      /* Which balls the assistant recommends most. The slugs live in a JSON
         array on the event, so they are unnested rather than counted per
         event — one event recommending three products is three data points. */
      prisma.$queryRaw<SlugRow[]>`
        SELECT slug, count(*)::bigint AS count
        FROM "AIEvent",
             LATERAL jsonb_array_elements_text(metadata -> 'slugs') AS slug
        WHERE "eventType" = 'PRODUCT_RECOMMENDED'
          AND "createdAt" >= ${since}
          AND metadata ? 'slugs'
        GROUP BY slug
        ORDER BY count DESC
        LIMIT 10
      `,

      prisma.aIConversation.count({ where: { createdAt: { gte: since } } }),
      prisma.aIConversation.count({
        where: { createdAt: { gte: since }, quotes: { some: {} } },
      }),
    ]);

    const eventCount = (type: string) =>
      byType.find((r) => r.eventType === type)?._count ?? 0;

    /* Fill the missing days so a fortnight of silence looks like silence
       rather than like two adjacent points. */
    const series: Array<{ date: string; messages: number }> = [];
    const found = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), Number(d.count)]));
    for (let i = days - 1; i >= 0; i -= 1) {
      const key = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      series.push({ date: key, messages: found.get(key) ?? 0 });
    }

    const names = popular.length
      ? await prisma.product.findMany({
          where: { slug: { in: popular.map((p) => p.slug) } },
          select: { slug: true, productName: true },
        })
      : [];
    const nameBySlug = new Map(names.map((n) => [n.slug, n.productName]));

    res.json({
      data: {
        days,
        /* The funnel, in the order it actually happens. Each stage counts
           conversations rather than events, so one chatty visitor cannot
           make the top of the funnel look wider than it is. */
        funnel: [
          { stage: 'Chats opened', count: eventCount('CHAT_OPENED') },
          { stage: 'Conversations', count: conversations },
          { stage: 'Quote started', count: eventCount('QUOTE_STARTED') },
          { stage: 'Quote submitted', count: eventCount('QUOTE_SUBMITTED') },
        ],
        events: {
          chatOpened: eventCount('CHAT_OPENED'),
          messagesSent: eventCount('MESSAGE_SENT'),
          productsRecommended: eventCount('PRODUCT_RECOMMENDED'),
          productsViewed: eventCount('PRODUCT_VIEWED'),
          quotesStarted: eventCount('QUOTE_STARTED'),
          quotesSubmitted: eventCount('QUOTE_SUBMITTED'),
          whatsappClicked: eventCount('WHATSAPP_CLICKED'),
          escalations: eventCount('HUMAN_ESCALATION'),
          completed: eventCount('CONVERSATION_COMPLETED'),
        },
        quoteRate: conversations > 0 ? Math.round((withQuote / conversations) * 1000) / 10 : null,
        series,
        popularProducts: popular.map((p) => ({
          slug: p.slug,
          name: nameBySlug.get(p.slug) ?? p.slug,
          count: Number(p.count),
        })),
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

    /* A conversation is finished when a person says it is, not when the chat
       window closes — a visitor who wanders off has not completed anything. */
    if ((input.status === 'CONVERTED' || input.status === 'CLOSED') && existing.status !== input.status) {
      await prisma.aIEvent.create({
        data: {
          conversationId: id,
          eventType: 'CONVERSATION_COMPLETED',
          metadata: { outcome: input.status },
        },
      });
    }

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
