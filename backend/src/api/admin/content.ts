/**
 * Editable page copy.
 *
 * Only keys lib/content.ts knows about can be saved. A block the site never
 * reads is a block nobody can correct, so an unknown page or key is refused
 * rather than stored and silently ignored.
 *
 * Clearing a block deletes the row rather than storing an empty string. That
 * is what makes "leave it empty to keep the original wording" true: with no
 * row, the page falls back to the words it was built with.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { badRequest, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { CONTENT_PAGES, keyExists, pageExists } from '../../lib/content';

export const adminContentRouter = Router();

adminContentRouter.use(csrfProtection);

const blockSchema = z.object({
  page: z.string().trim().min(1).max(60),
  key: z.string().trim().min(1).max(80),
  /* Plain text. Long enough for a paragraph, short enough that nobody pastes
     a page into a heading. */
  text: z.string().max(2000),
});

/**
 * Everything that can be edited, with whatever has been edited.
 *
 * The registry is the list, not the table: a page with nothing overridden
 * still appears, with its keys empty and a note that the original wording
 * stands. Listing only the rows would hide every place that can be changed.
 */
adminContentRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.contentBlock.findMany({
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    const saved = new Map(rows.map((r) => [`${r.page}:${r.key}`, r]));

    res.json({
      data: CONTENT_PAGES.map((page) => ({
        page: page.page,
        title: page.title,
        path: page.path,
        keys: page.keys.map((k) => {
          const row = saved.get(`${page.page}:${k.key}`);
          return {
            key: k.key,
            label: k.label,
            where: k.where,
            long: k.long ?? false,
            text: row?.text ?? '',
            edited: Boolean(row),
            updatedAt: row?.updatedAt ?? null,
            updatedBy: row?.updatedBy ?? null,
          };
        }),
      })),
    });
  }),
);

adminContentRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const input = blockSchema.parse(req.body);

    if (!pageExists(input.page)) throw badRequest(`There is no page called "${input.page}".`);
    if (!keyExists(input.page, input.key)) {
      throw badRequest(`The ${input.page} page has nowhere called "${input.key}" to put text.`);
    }

    const text = input.text.trim();

    /* Empty means "use the original". Storing a blank would leave a heading
       genuinely blank on the site, which nobody means by clearing a field. */
    if (!text) {
      await prisma.contentBlock.deleteMany({ where: { page: input.page, key: input.key } });
      await log({
        adminId: req.admin?.id,
        action: 'updated',
        entity: 'page content',
        summary: `${input.page} ${input.key} restored to the original wording`,
      });
      res.json({ data: { page: input.page, key: input.key, text: '', edited: false } });
      return;
    }

    const row = await prisma.contentBlock.upsert({
      where: { page_key: { page: input.page, key: input.key } },
      create: { page: input.page, key: input.key, text, updatedById: req.admin?.id ?? null },
      update: { text, updatedById: req.admin?.id ?? null },
      include: { updatedBy: { select: { id: true, name: true } } },
    });

    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'page content',
      entityId: row.id,
      summary: `${input.page} ${input.key}`,
    });

    res.json({ data: { ...row, edited: true } });
  }),
);

adminContentRouter.delete(
  '/:page/:key',
  asyncHandler(async (req, res) => {
    const page = String(req.params.page);
    const key = String(req.params.key);

    const existing = await prisma.contentBlock.findUnique({ where: { page_key: { page, key } } });
    if (!existing) throw notFound('That text has not been changed, so there is nothing to restore.');

    await prisma.contentBlock.delete({ where: { id: existing.id } });
    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'page content',
      summary: `${page} ${key} restored to the original wording`,
    });
    res.status(204).end();
  }),
);
