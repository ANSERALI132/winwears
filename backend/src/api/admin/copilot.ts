/**
 * The Copilot API.
 *
 * Every route is scoped to the signed-in admin. A thread is looked up by id
 * *and* owner, so a guessed id belonging to a colleague misses rather than
 * reads — one person asking about margins should not have that question
 * surface on somebody else's screen.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { ApiError, badRequest, notFound } from '../../lib/errors';
import { aiProvider } from '../../ai';
import { askCopilot, CopilotUnavailable } from '../../ai/copilot/thread';
import { copilotToolNames } from '../../ai/copilot/tools';
import { pagination } from '../../validation/common';

export const adminCopilotRouter = Router();

adminCopilotRouter.use(csrfProtection);

const askSchema = z.object({
  question: z.string({ required_error: 'Ask something.' }).trim().min(1, 'Ask something.').max(2000),
  threadId: z.string().trim().max(64).optional(),
});

const threadListQuery = pagination.extend({});

/** Whether the copilot can run at all, so the screen can say why not rather
 *  than failing on the first question. */
adminCopilotRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        configured: aiProvider.configured,
        model: aiProvider.configured ? aiProvider.model : null,
        tools: copilotToolNames,
        /* Named so the screen can explain the boundary rather than leaving
           somebody to discover it by asking for a change. */
        readOnly: true,
      },
    });
  }),
);

adminCopilotRouter.get(
  '/threads',
  asyncHandler(async (req, res) => {
    const q = threadListQuery.parse(req.query);
    const where = { userId: req.admin?.id ?? '' };

    const [total, rows] = await Promise.all([
      prisma.copilotThread.count({ where }),
      prisma.copilotThread.findMany({
        where,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        select: {
          id: true, title: true, messageCount: true, lastMessageAt: true, createdAt: true,
        },
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminCopilotRouter.get(
  '/threads/:id',
  asyncHandler(async (req, res) => {
    const thread = await prisma.copilotThread.findFirst({
      where: { id: String(req.params.id), userId: req.admin?.id ?? '' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!thread) throw notFound('That thread no longer exists.');
    res.json({ data: thread });
  }),
);

adminCopilotRouter.post(
  '/ask',
  asyncHandler(async (req, res) => {
    const input = askSchema.parse(req.body);
    const admin = req.admin;
    if (!admin) throw badRequest('Sign in again.');

    try {
      const answer = await askCopilot({
        userId: admin.id,
        userName: admin.name,
        userRole: admin.role,
        threadId: input.threadId,
        question: input.question,
      });
      res.json({ data: answer });
    } catch (err) {
      if (err instanceof CopilotUnavailable) {
        /* 503 for a provider or configuration problem, 429 for a thread that
           has simply grown too long — different problems, different fixes. */
        const status = err.reason === 'limit' ? 429 : 503;
        throw new ApiError(status, 'COPILOT_UNAVAILABLE', err.message);
      }
      throw err;
    }
  }),
);

adminCopilotRouter.delete(
  '/threads/:id',
  asyncHandler(async (req, res) => {
    const thread = await prisma.copilotThread.findFirst({
      where: { id: String(req.params.id), userId: req.admin?.id ?? '' },
      select: { id: true },
    });
    if (!thread) throw notFound('That thread no longer exists.');

    /* No audit entry: a thread is one person's own notes to themselves, and
       nothing in it changed the business. */
    await prisma.copilotThread.delete({ where: { id: thread.id } });
    res.status(204).end();
  }),
);
