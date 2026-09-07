/**
 * The public API — everything the website itself reads, plus the two forms a
 * visitor can post. No authentication, so it is read-only apart from the
 * enquiry endpoints, and every response is built by lib/serialize.
 */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/error';
import { formLimiter, readLimiter } from '../lib/rateLimit';
import { notFound } from '../lib/errors';
import { getAllSettings, toPublicContact } from '../lib/settings';
import { productCard, publicCategory, publicProduct } from '../lib/serialize';
import { buildProductOrderBy, buildProductWhere, PRODUCT_FULL_INCLUDE, PRODUCT_INCLUDE } from '../lib/productQuery';
import { productListQuery } from '../validation/product';
import { contactCreateSchema, quoteCreateSchema } from '../validation/enquiry';
import { upload } from '../middleware/upload';
import { assertAllowed, ALLOWED_UPLOAD_TYPES } from '../lib/fileType';
import { storage } from '../lib/storage';

export const publicRouter = Router();

publicRouter.use(readLimiter);

/* ------------------------------------------------------------ settings ---- */

publicRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await getAllSettings();
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ data: toPublicContact(settings) });
  }),
);

/* ---------------------------------------------------------- categories ---- */

publicRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.category.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { status: 'PUBLISHED', deletedAt: null } } } },
      },
    });

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      data: rows.map((c) => ({ ...publicCategory(c), productCount: c._count.products })),
    });
  }),
);

publicRouter.get(
  '/categories/:slug',
  asyncHandler(async (req, res) => {
    const category = await prisma.category.findFirst({
      where: { slug: String(req.params.slug), active: true },
    });
    if (!category) throw notFound('That category does not exist.');
    res.json({ data: publicCategory(category) });
  }),
);

/* ------------------------------------------------------------ products ---- */

publicRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const q = productListQuery.parse(req.query);
    const where = buildProductWhere(q, { publicOnly: true });

    /* Always paginated: a catalogue that grows to 500 balls must not turn
       one page load into 500 rows and 3,000 images. */
    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: buildProductOrderBy(q.sort),
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: PRODUCT_INCLUDE,
      }),
    ]);

    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    res.json({
      data: rows.map(productCard),
      meta: {
        page: q.page,
        perPage: q.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.perPage)),
      },
    });
  }),
);

/** Values actually present in the published catalogue, so the filter UI can
 *  build itself instead of hard-coding options that may not exist. */
publicRouter.get(
  '/products/filters',
  asyncHandler(async (_req, res) => {
    const where: Prisma.ProductWhereInput = { status: 'PUBLISHED', deletedAt: null };
    const [constructions, materials, usages, sizes, categories] = await Promise.all([
      prisma.product.findMany({ where, select: { construction: true }, distinct: ['construction'] }),
      prisma.product.findMany({ where, select: { material: true }, distinct: ['material'] }),
      prisma.product.findMany({ where, select: { usage: true }, distinct: ['usage'] }),
      prisma.product.findMany({ where, select: { size: true }, distinct: ['size'] }),
      prisma.category.findMany({
        where: { active: true },
        orderBy: { displayOrder: 'asc' },
        select: { slug: true, name: true },
      }),
    ]);

    /* Distinct can still return nulls and blanks; neither belongs in a
       filter dropdown. */
    const clean = (values: (string | null)[]) =>
      [...new Set(values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0))].sort();

    res.json({
      data: {
        categories,
        construction: clean(constructions.map((r) => r.construction)),
        material: clean(materials.map((r) => r.material)),
        usage: clean(usages.map((r) => r.usage)),
        size: clean(sizes.map((r) => r.size)),
      },
    });
  }),
);

publicRouter.get(
  '/products/featured',
  asyncHandler(async (_req, res) => {
    const settings = await getAllSettings();
    const limit = Math.min(24, Math.max(1, Number(settings['homepage.featuredLimit'] ?? 6) || 6));

    const rows = await prisma.product.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, featured: true },
      orderBy: [{ displayOrder: 'asc' }, { publishedAt: 'desc' }],
      take: limit,
      include: PRODUCT_INCLUDE,
    });

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ data: rows.map(productCard) });
  }),
);

publicRouter.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const key = String(req.params.slug);
    const product = await prisma.product.findFirst({
      /* Accept the id too — the old site linked by id, and a live link
         should not break just because we moved to slugs. */
      where: { OR: [{ slug: key }, { id: key }], status: 'PUBLISHED', deletedAt: null },
      include: PRODUCT_FULL_INCLUDE,
    });
    if (!product) throw notFound('That football is not available.');

    const related = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        status: 'PUBLISHED',
        deletedAt: null,
        NOT: { id: product.id },
      },
      orderBy: [{ featured: 'desc' }, { displayOrder: 'asc' }],
      take: 4,
      include: PRODUCT_INCLUDE,
    });

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ data: publicProduct(product), related: related.map(productCard) });
  }),
);

/* ------------------------------------------------------------- enquiry ---- */

/** Files a visitor may attach to an RFQ. */
const quoteUploads = upload.fields([
  { name: 'logoFile', maxCount: 1 },
  { name: 'designFile', maxCount: 1 },
]);

publicRouter.post(
  '/quotes',
  formLimiter,
  quoteUploads,
  asyncHandler(async (req, res) => {
    const input = quoteCreateSchema.parse(req.body);

    /* Honeypot filled means a bot. Answer exactly like a success so it learns
       nothing, and write nothing. */
    if (input.website) {
      res.status(201).json({ data: { ok: true } });
      return;
    }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const stored: { logoFile?: string; designFile?: string } = {};

    for (const field of ['logoFile', 'designFile'] as const) {
      const file = files?.[field]?.[0];
      if (!file) continue;
      /* Content sniff, not the browser's word for it. */
      const contentType = assertAllowed(file.buffer, ALLOWED_UPLOAD_TYPES);
      const saved = await storage.put({
        buffer: file.buffer,
        filename: file.originalname,
        contentType,
        prefix: 'quotes',
      });
      stored[field] = saved.url;
    }

    /* Only link a product that really is published. */
    let productId: string | null = null;
    if (input.productId) {
      const hit = await prisma.product.findFirst({
        where: { OR: [{ id: input.productId }, { slug: input.productId }], status: 'PUBLISHED', deletedAt: null },
        select: { id: true },
      });
      productId = hit?.id ?? null;
    }

    const quote = await prisma.quoteRequest.create({
      data: {
        name: input.name,
        company: input.company ?? null,
        country: input.country ?? null,
        email: input.email,
        whatsapp: input.whatsapp ?? null,
        productId,
        category: input.category ?? null,
        quantity: input.quantity ?? null,
        size: input.size ?? null,
        customizationRequired: input.customizationRequired,
        message: input.message ?? null,
        logoFile: stored.logoFile ?? null,
        designFile: stored.designFile ?? null,
      },
      select: { id: true, createdAt: true },
    });

    res.status(201).json({
      data: {
        ok: true,
        reference: quote.id.slice(-8).toUpperCase(),
        message: 'Thank you — your request has reached us. We will reply by email or WhatsApp.',
      },
    });
  }),
);

publicRouter.post(
  '/contact',
  formLimiter,
  asyncHandler(async (req, res) => {
    const input = contactCreateSchema.parse(req.body);

    if (input.website) {
      res.status(201).json({ data: { ok: true } });
      return;
    }

    await prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        company: input.company ?? null,
        whatsapp: input.whatsapp ?? null,
        subject: input.subject ?? null,
        message: input.message,
      },
      select: { id: true },
    });

    res.status(201).json({
      data: { ok: true, message: 'Thank you — your message has reached us. We will be in touch shortly.' },
    });
  }),
);
