/**
 * Admin knowledge-base CRUD.
 *
 * What the AI assistant is allowed to say about the business. Editing here is
 * how the business teaches the agent something, and unpublishing is how it
 * takes something back â€” the retrieval tool reads PUBLISHED rows only, so a
 * policy that changes stops being quoted the moment it is unpublished.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import {
  KNOWLEDGE_CATEGORIES,
  knowledgeCreateSchema,
  knowledgeListQuery,
  knowledgeUpdateSchema,
} from '../../validation/knowledge';

export const adminKnowledgeRouter = Router();

adminKnowledgeRouter.use(csrfProtection);

/** The category list the admin screen offers, plus any the business has
 *  already invented, so an existing entry never falls off the filter. */
adminKnowledgeRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const used = await prisma.aIKnowledge.findMany({
      distinct: ['category'],
      select: { category: true },
    });
    const all = new Set<string>([...KNOWLEDGE_CATEGORIES, ...used.map((u) => u.category)]);
    res.json({ data: [...all].sort() });
  }),
);

adminKnowledgeRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = knowledgeListQuery.parse(req.query);

    const and: Prisma.AIKnowledgeWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.category) and.push({ category: q.category });
    if (q.q) {
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { content: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.aIKnowledge.count({ where }),
      prisma.aIKnowledge.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminKnowledgeRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const entry = await prisma.aIKnowledge.findUnique({ where: { id: String(req.params.id) } });
    if (!entry) throw notFound('That knowledge entry no longer exists.');
    res.json({ data: entry });
  }),
);

adminKnowledgeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = knowledgeCreateSchema.parse(req.body);
    const entry = await prisma.aIKnowledge.create({
      data: { ...input, category: input.category ?? 'general' },
    });

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'ai_knowledge',
      entityId: entry.id,
      summary: `${entry.title} (${entry.status})`,
    });

    res.status(201).json({ data: entry });
  }),
);

adminKnowledgeRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = knowledgeUpdateSchema.parse(req.body);

    const existing = await prisma.aIKnowledge.findUnique({ where: { id } });
    if (!existing) throw notFound('That knowledge entry no longer exists.');

    /* Clearing the category means "back to general", not an empty string:
       the column is required, and an unlabelled entry would vanish from every
       filter in the admin screen. */
    const { category, ...rest } = input;
    const entry = await prisma.aIKnowledge.update({
      where: { id },
      data: { ...rest, ...(category === undefined ? {} : { category: category ?? 'general' }) },
    });

    /* Publication state is the part worth being able to reconstruct later:
       it decides whether customers were being told this. */
    await log({
      adminId: req.admin?.id,
      action: existing.status !== entry.status ? 'published' : 'updated',
      entity: 'ai_knowledge',
      entityId: entry.id,
      summary:
        existing.status !== entry.status
          ? `${entry.title}: ${existing.status} -> ${entry.status}`
          : entry.title,
    });

    res.json({ data: entry });
  }),
);

adminKnowledgeRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.aIKnowledge.findUnique({ where: { id } });
    if (!existing) throw notFound('That knowledge entry no longer exists.');

    /* A hard delete, unlike products. A knowledge entry has no history worth
       preserving and no foreign keys pointing at it; unpublishing is the
       reversible option and is one click away. */
    await prisma.aIKnowledge.delete({ where: { id } });

    await log({
      adminId: req.admin?.id,
      action: 'deleted',
      entity: 'ai_knowledge',
      entityId: id,
      summary: existing.title,
    });

    res.status(204).end();
  }),
);
