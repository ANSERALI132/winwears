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
import { attachRfqToLead, resolveIdentity, touchCompany, type ResolvedIdentity } from '../lib/crm';
import { pageExists } from '../lib/content';
import { notify } from '../lib/notify';
import { dispatch } from '../lib/webhooks';

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

/* ------------------------------------------------------------- content ---- */

/**
 * Edited copy for one page.
 *
 * Returns only what has actually been changed, so a page nobody has edited
 * gets an empty object and keeps the words it was built with. Cached the same
 * way settings are: copy changes rarely, and every page asks for this before
 * it can settle.
 */
publicRouter.get(
  '/content/:page',
  asyncHandler(async (req, res) => {
    const page = String(req.params.page);
    if (!pageExists(page)) {
      /* An empty answer rather than a 404: a page asking for copy nobody has
         defined is a page that should render, not one that should error. */
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      res.json({ data: {} });
      return;
    }

    const rows = await prisma.contentBlock.findMany({
      where: { page },
      select: { key: true, text: true },
    });

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ data: Object.fromEntries(rows.map((r) => [r.key, r.text])) });
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
        _count: {
          select: {
            products: { where: { status: 'PUBLISHED', deletedAt: null } },
            children: { where: { active: true } },
          },
        },
      },
    });

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      data: rows.map((c) => ({ ...publicCategory(c), productCount: c._count.products, childCount: c._count.children })),
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
        orderBy: buildProductOrderBy(q.sort, { byCategoryFirst: Boolean(q.category) }),
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
      /* The collection page is the ball ranges: apparel and the groups it
         sits in are left out of its filter. */
      prisma.category.findMany({
        where: { active: true, parentId: null, footballRange: true },
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

    /* Attach the enquiry to an account, creating one if this is the first
       time we have heard from them. Failing to file it must never lose the
       enquiry itself, so the identity work is allowed to fail quietly and
       the request is still stored. */
    let identity: ResolvedIdentity = { companyId: null, contactId: null, createdCompany: false, createdContact: false };
    try {
      identity = await resolveIdentity({
        name: input.name,
        email: input.email,
        whatsapp: input.whatsapp ?? null,
        companyName: input.company ?? null,
        country: input.country ?? null,
        source: 'WEBSITE_FORM',
      });
    } catch (err) {
      console.error('[crm] could not resolve identity for a quote request', err);
    }

    /* An RFQ is an opportunity, so it opens or advances one rather than
       sitting in an inbox waiting to be noticed. Allowed to fail for the
       same reason as the identity work above. */
    let leadId: string | null = null;
    try {
      leadId = await attachRfqToLead({
        companyId: identity.companyId,
        contactId: identity.contactId,
        title: input.quantity ? `${input.quantity} footballs` : 'Quote request',
        productId,
        quantity: input.quantity ?? null,
        size: input.size ?? null,
        customizationRequired: input.customizationRequired,
        requirements: input.message ?? null,
        source: 'WEBSITE_FORM',
      });
    } catch (err) {
      console.error('[crm] could not attach a quote request to a lead', err);
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
        companyId: identity.companyId,
        contactId: identity.contactId,
        leadId,
        lastActivityAt: new Date(),
      },
      select: { id: true, createdAt: true },
    });

    await touchCompany(identity.companyId);

    /* No email or phone number in the payload. A webhook sends business data
       to an outside address, and a customer did not consent to their contact
       details going there — the reference is enough to look them up here. */
    await dispatch('rfq.received', {
      company: input.company ?? null,
      country: input.country ?? null,
      quantity: input.quantity ?? null,
      category: input.category ?? null,
    });

    await notify({
      kind: 'ENQUIRY_RECEIVED',
      title: `Quote request from ${input.company || input.name}`,
      body: [input.quantity ? `${input.quantity} units` : null, input.country]
        .filter(Boolean)
        .join(' · ') || null,
      href: `#/rfq/${quote.id}`,
      entity: 'quote request',
      entityId: quote.id,
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

    let identity: ResolvedIdentity = { companyId: null, contactId: null, createdCompany: false, createdContact: false };
    try {
      identity = await resolveIdentity({
        name: input.name,
        email: input.email,
        whatsapp: input.whatsapp ?? null,
        companyName: input.company ?? null,
        source: 'WEBSITE_FORM',
      });
    } catch (err) {
      console.error('[crm] could not resolve identity for a contact message', err);
    }

    await prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        company: input.company ?? null,
        whatsapp: input.whatsapp ?? null,
        subject: input.subject ?? null,
        message: input.message,
        companyId: identity.companyId,
        contactId: identity.contactId,
      },
      select: { id: true },
    });

    await touchCompany(identity.companyId);

    await notify({
      kind: 'ENQUIRY_RECEIVED',
      title: `Message from ${input.name}`,
      body: input.subject || input.message.slice(0, 200),
      href: '#/messages',
      entity: 'contact message',
    });

    res.status(201).json({
      data: { ok: true, message: 'Thank you — your message has reached us. We will be in touch shortly.' },
    });
  }),
);
