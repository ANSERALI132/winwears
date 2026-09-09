/**
 * Dashboard statistics, settings, admin users and the activity log.
 */
import { Router } from 'express';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/auth';
import {
  getAllSettings,
  SETTING_DEFAULTS,
  SETTING_GROUPS_ELSEWHERE,
  writeSettings,
} from '../../lib/settings';
import { activityListQuery, settingsUpdateSchema, userCreateSchema, userUpdateSchema } from '../../validation/admin';
import { log } from '../../lib/audit';

export const adminStatsRouter = Router();
export const adminSettingsRouter = Router();
export const adminUsersRouter = Router();
export const adminActivityRouter = Router();

adminSettingsRouter.use(csrfProtection);
adminUsersRouter.use(csrfProtection);

/* ---------------------------------------------------------------- stats --- */

adminStatsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    /* Every number below is a real count. Nothing here is estimated or
       padded — an empty database shows zeros. */
    const [
      products,
      published,
      drafts,
      archived,
      featured,
      categories,
      activeCategories,
      quotesTotal,
      quotesNew,
      messagesTotal,
      messagesNew,
      images,
      recentQuotes,
      recentActivity,
    ] = await Promise.all([
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.product.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      prisma.product.count({ where: { deletedAt: null, status: 'DRAFT' } }),
      prisma.product.count({ where: { OR: [{ status: 'ARCHIVED' }, { NOT: { deletedAt: null } }] } }),
      prisma.product.count({ where: { deletedAt: null, featured: true } }),
      prisma.category.count(),
      prisma.category.count({ where: { active: true } }),
      prisma.quoteRequest.count(),
      prisma.quoteRequest.count({ where: { status: 'NEW' } }),
      prisma.contactMessage.count(),
      prisma.contactMessage.count({ where: { status: 'NEW' } }),
      prisma.productImage.count(),
      prisma.quoteRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, company: true, country: true, status: true, createdAt: true },
      }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { admin: { select: { name: true } } },
      }),
    ]);

    /* Products with no image at all — the one thing worth nagging about,
       because they render as an empty card on the public site. */
    const withoutImages = await prisma.product.count({
      where: { deletedAt: null, status: 'PUBLISHED', images: { none: {} } },
    });

    /* The badge on the nav. Everybody's open tasks, not just the reader's:
       an unassigned task nobody can see is a task nobody does. */
    const tasksOpen = await prisma.task.count({ where: { status: 'OPEN' } });

    res.json({
      data: {
        products: { total: products, published, drafts, archived, featured, withoutImages },
        categories: { total: categories, active: activeCategories },
        quotes: { total: quotesTotal, new: quotesNew },
        messages: { total: messagesTotal, new: messagesNew },
        tasks: { open: tasksOpen },
        images: { total: images },
        recentQuotes,
        recentActivity,
      },
    });
  }),
);

/* ------------------------------------------------------------- settings --- */

adminSettingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const values = await getAllSettings();
    res.json({
      data: {
        values,
        /* The AI group is left out: it has its own screen, where a boolean is
           a checkbox and a model is a select rather than another text box. */
        definitions: SETTING_DEFAULTS.filter((d) => !SETTING_GROUPS_ELSEWHERE.has(d.group)).map((d) => ({
          key: d.key,
          group: d.group,
          label: d.label,
          default: d.value,
        })),
      },
    });
  }),
);

adminSettingsRouter.put(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { values } = settingsUpdateSchema.parse(req.body);
    const written = await writeSettings(values);
    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'settings',
      summary: written.join(', ') || 'no known keys',
    });
    res.json({ data: { values: await getAllSettings(), written } });
  }),
);

/* ---------------------------------------------------------------- users --- */

/* Managing accounts is ADMIN-only; an EDITOR cannot grant itself more. */
adminUsersRouter.use(requireRole('ADMIN'));

const publicUser = { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true };

adminUsersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: publicUser });
    res.json({ data: rows });
  }),
);

adminUsersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = userCreateSchema.parse(req.body);

    const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (clash) throw conflict('An account with that email already exists.');

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        active: input.active,
      },
      select: publicUser,
    });

    await log({ adminId: req.admin?.id, action: 'created', entity: 'user', entityId: user.id, summary: user.email });
    res.status(201).json({ data: user });
  }),
);

adminUsersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = userUpdateSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound('That account no longer exists.');

    /* Guard rails against locking everybody out: you cannot demote or
       deactivate the last active administrator, including yourself. */
    const losingAdmin =
      existing.role === 'ADMIN' && ((input.role && input.role !== 'ADMIN') || input.active === false);
    if (losingAdmin) {
      const others = await prisma.user.count({ where: { role: 'ADMIN', active: true, NOT: { id } } });
      if (others === 0) throw badRequest('This is the last active administrator. Promote another account first.');
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.email ? { email: input.email } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
      select: publicUser,
    });

    /* A changed password or a disabled account must end existing sessions. */
    if (input.password || input.active === false) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'user', entityId: id, summary: user.email });
    res.json({ data: user });
  }),
);

adminUsersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    if (id === req.admin?.id) throw badRequest('You cannot delete the account you are signed in with.');

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound('That account no longer exists.');

    if (existing.role === 'ADMIN') {
      const others = await prisma.user.count({ where: { role: 'ADMIN', active: true, NOT: { id } } });
      if (others === 0) throw badRequest('This is the last active administrator and cannot be removed.');
    }

    await prisma.user.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'user', entityId: id, summary: existing.email });
    res.json({ data: { ok: true } });
  }),
);

/* ------------------------------------------------------------- activity --- */

adminActivityRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = activityListQuery.parse(req.query);
    const where = q.entity ? { entity: q.entity } : {};

    const [total, rows] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: { admin: { select: { name: true, email: true } } },
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);
