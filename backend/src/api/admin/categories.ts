/**
 * Admin category CRUD.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { conflict, notFound } from '../../lib/errors';
import { uniqueSlug } from '../../lib/slug';
import { categoryCreateSchema, categoryUpdateSchema } from '../../validation/category';
import { reorderSchema } from '../../validation/product';
import { log } from '../../lib/audit';

export const adminCategoriesRouter = Router();

adminCategoriesRouter.use(csrfProtection);

/**
 * One level of grouping only. A parent must exist, cannot be the category being
 * saved and cannot sit under another category itself; a category that already
 * holds others cannot be moved under one. Anything deeper would stop "no parent
 * and no children" meaning a standalone range, which is how the public pages
 * tell the ball ranges apart.
 */
async function checkParent(parentId: string | null | undefined, selfId?: string): Promise<void> {
  if (!parentId) return;
  if (parentId === selfId) throw conflict('A category cannot sit under itself.');

  const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { parentId: true } });
  if (!parent) throw notFound('That parent category no longer exists.');
  if (parent.parentId) throw conflict('That category already sits under another one. Choose a top-level category.');

  if (selfId && (await prisma.category.count({ where: { parentId: selfId } })) > 0) {
    throw conflict('This category has others under it, so it cannot be placed under another.');
  }
}

adminCategoriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.category.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    res.json({ data: rows.map((c) => ({ ...c, productCount: c._count.products })) });
  }),
);

adminCategoriesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findUnique({ where: { id: String(req.params.id) } });
    if (!category) throw notFound('That category no longer exists.');
    res.json({ data: category });
  }),
);

adminCategoriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = categoryCreateSchema.parse(req.body);
    await checkParent(input.parentId);
    const slug = await uniqueSlug('category', input.slug || input.name);

    const category = await prisma.category.create({ data: { ...input, slug } });
    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'category',
      entityId: category.id,
      summary: category.name,
    });
    res.status(201).json({ data: category });
  }),
);

adminCategoriesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = categoryUpdateSchema.parse(req.body);

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw notFound('That category no longer exists.');
    if (input.parentId !== undefined) await checkParent(input.parentId, id);

    const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug('category', input.slug, id) : existing.slug;

    const category = await prisma.category.update({ where: { id }, data: { ...input, slug } });
    await log({ adminId: req.admin?.id, action: 'updated', entity: 'category', entityId: id, summary: category.name });
    res.json({ data: category });
  }),
);

adminCategoriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);

    /* Products point at a category with onDelete: Restrict, so refuse here
       with a message that says what to do rather than letting the database
       throw a foreign-key error at the admin. */
    const count = await prisma.product.count({ where: { categoryId: id, deletedAt: null } });
    if (count > 0) {
      throw conflict(
        `That category still holds ${count} product${count === 1 ? '' : 's'}. Move or delete them first, or deactivate the category instead.`,
      );
    }

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) throw notFound('That category no longer exists.');

    await prisma.category.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'category', entityId: id, summary: category.name });
    res.json({ data: { ok: true } });
  }),
);

adminCategoriesRouter.patch(
  '/:id/active',
  asyncHandler(async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const category = await prisma.category.update({ where: { id: String(req.params.id) }, data: { active } });
    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'category',
      entityId: category.id,
      summary: `${category.name} active=${active}`,
    });
    res.json({ data: category });
  }),
);

adminCategoriesRouter.post(
  '/reorder',
  asyncHandler(async (req, res) => {
    const { ids } = reorderSchema.parse(req.body);
    await prisma.$transaction(
      ids.map((id, index) => prisma.category.update({ where: { id }, data: { displayOrder: index } })),
    );
    await log({ adminId: req.admin?.id, action: 'reordered', entity: 'category', summary: `${ids.length} categories` });
    res.json({ data: { ok: true } });
  }),
);
