/**
 * Admin product CRUD.
 *
 * Everything that changes a product goes through here, and every change is
 * written to the activity log. Deletes are soft by default so a mis-click is
 * recoverable; a hard delete is a separate, deliberate call.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { badRequest, notFound } from '../../lib/errors';
import { uniqueSku, uniqueSlug } from '../../lib/slug';
import { adminProduct } from '../../lib/serialize';
import { buildProductOrderBy, buildProductWhere, PRODUCT_FULL_INCLUDE, PRODUCT_INCLUDE } from '../../lib/productQuery';
import { productCreateSchema, productListQuery, productUpdateSchema, reorderSchema } from '../../validation/product';
import { featureInput, specificationInput } from '../../validation/product';
import { storage } from '../../lib/storage';
import { log } from '../../lib/audit';
import { z } from 'zod';

export const adminProductsRouter = Router();

adminProductsRouter.use(csrfProtection);

/**
 * Scalar columns, split out from the nested feature/spec arrays.
 *
 * Generic over the input so a full create keeps its required fields required —
 * widening to Partial here would make `productName` optional at the call site
 * and Prisma would rightly refuse it.
 */
function scalarData<T extends Partial<z.infer<typeof productCreateSchema>>>(input: T) {
  const { features: _f, specifications: _s, slug: _slug, price, ...rest } = input;
  return {
    ...rest,
    ...(price === undefined ? {} : { price: new Prisma.Decimal(price) }),
  };
}

/* ---------------------------------------------------------------- list ---- */

adminProductsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = productListQuery.parse(req.query);
    const where = buildProductWhere(q, { publicOnly: false });

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

    res.json({
      data: rows.map(adminProduct),
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminProductsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: String(req.params.id) },
      include: PRODUCT_FULL_INCLUDE,
    });
    if (!product) throw notFound('That product no longer exists.');
    res.json({ data: adminProduct(product) });
  }),
);

/* -------------------------------------------------------------- create ---- */

adminProductsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = productCreateSchema.parse(req.body);

    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw badRequest('Choose a category that exists.', [{ field: 'categoryId', message: 'Unknown category.' }]);

    const slug = await uniqueSlug('product', input.slug || input.productName);

    const product = await prisma.product.create({
      data: {
        ...scalarData(input),
        slug,
        publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
        features: { create: input.features.map((f, i) => ({ ...f, id: undefined, displayOrder: f.displayOrder || i })) },
        specifications: {
          create: input.specifications.map((s, i) => ({ ...s, id: undefined, displayOrder: s.displayOrder || i })),
        },
      },
      include: PRODUCT_FULL_INCLUDE,
    });

    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'product',
      entityId: product.id,
      summary: `${product.productName} (${product.sku})`,
    });

    res.status(201).json({ data: adminProduct(product) });
  }),
);

/* -------------------------------------------------------------- update ---- */

adminProductsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = productUpdateSchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFound('That product no longer exists.');

    if (input.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw badRequest('Choose a category that exists.', [{ field: 'categoryId', message: 'Unknown category.' }]);
    }

    /* Only re-slug when asked, or when the name changed and the slug was
       still the generated one — a shared link should not rot silently. */
    let slug = existing.slug;
    if (input.slug && input.slug !== existing.slug) {
      slug = await uniqueSlug('product', input.slug, id);
    }

    const goingLive = input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';

    const product = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...scalarData(input),
          slug,
          ...(goingLive ? { publishedAt: existing.publishedAt ?? new Date() } : {}),
        },
      });

      /* Features and specs are sent whole. Replacing the set is simpler than
         diffing it, and the admin UI always posts the complete list. */
      if (input.features) {
        await tx.productFeature.deleteMany({ where: { productId: id } });
        if (input.features.length) {
          await tx.productFeature.createMany({
            data: input.features.map((f, i) => ({
              productId: id,
              title: f.title,
              description: f.description ?? null,
              icon: f.icon ?? null,
              displayOrder: f.displayOrder || i,
            })),
          });
        }
      }

      if (input.specifications) {
        await tx.productSpecification.deleteMany({ where: { productId: id } });
        if (input.specifications.length) {
          await tx.productSpecification.createMany({
            data: input.specifications.map((s, i) => ({
              productId: id,
              label: s.label,
              value: s.value,
              displayOrder: s.displayOrder || i,
            })),
          });
        }
      }

      return tx.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_FULL_INCLUDE });
    });

    await log({
      adminId: req.admin?.id,
      action: goingLive ? 'published' : 'updated',
      entity: 'product',
      entityId: id,
      summary: `${product.productName} (${product.sku})`,
    });

    res.json({ data: adminProduct(product) });
  }),
);

/* ------------------------------------------------------ publish toggle ---- */

const statusSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) });

adminProductsRouter.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { status } = statusSchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFound('That product no longer exists.');

    const product = await prisma.product.update({
      where: { id },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
      },
      include: PRODUCT_FULL_INCLUDE,
    });

    await log({
      adminId: req.admin?.id,
      action: status === 'PUBLISHED' ? 'published' : 'unpublished',
      entity: 'product',
      entityId: id,
      summary: `${product.productName} -> ${status}`,
    });

    res.json({ data: adminProduct(product) });
  }),
);

const featuredSchema = z.object({ featured: z.boolean() });

adminProductsRouter.patch(
  '/:id/featured',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { featured } = featuredSchema.parse(req.body);
    const product = await prisma.product.update({
      where: { id },
      data: { featured },
      include: PRODUCT_FULL_INCLUDE,
    });
    await log({
      adminId: req.admin?.id,
      action: 'updated',
      entity: 'product',
      entityId: id,
      summary: `${product.productName} featured=${featured}`,
    });
    res.json({ data: adminProduct(product) });
  }),
);

/* ----------------------------------------------------------- duplicate ---- */

adminProductsRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const source = await prisma.product.findUnique({
      where: { id: String(req.params.id) },
      include: PRODUCT_FULL_INCLUDE,
    });
    if (!source) throw notFound('That product no longer exists.');

    const name = `${source.productName} (copy)`;
    const slug = await uniqueSlug('product', name);
    const sku = await uniqueSku(source.sku);

    /* The copy starts as a draft, never featured: a duplicate is a starting
       point for editing, not something that should appear on the site the
       moment it is made. */
    const copy = await prisma.product.create({
      data: {
        productName: name,
        slug,
        sku,
        shortDescription: source.shortDescription,
        fullDescription: source.fullDescription,
        categoryId: source.categoryId,
        status: 'DRAFT',
        featured: false,
        displayOrder: source.displayOrder,

        construction: source.construction,
        material: source.material,
        usage: source.usage,
        size: source.size,
        weight: source.weight,
        bladder: source.bladder,
        panelCount: source.panelCount,
        surface: source.surface,
        stitching: source.stitching,
        technology: source.technology,
        customizationAvailable: source.customizationAvailable,
        customizationNotes: source.customizationNotes,

        price: source.price,
        currency: source.currency,
        priceLabel: source.priceLabel,
        moq: source.moq,
        quoteOnly: source.quoteOnly,

        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
        keywords: source.keywords,
        ogImage: source.ogImage,

        features: {
          create: source.features.map((f) => ({
            title: f.title,
            description: f.description,
            icon: f.icon,
            displayOrder: f.displayOrder,
          })),
        },
        specifications: {
          create: source.specifications.map((s) => ({
            label: s.label,
            value: s.value,
            displayOrder: s.displayOrder,
          })),
        },
        /* Images are referenced, not re-uploaded: the same stored object is
           pointed at twice. storageKey is deliberately left null on the copy
           so deleting the copy cannot delete the original's file. */
        images: {
          create: source.images.map((i) => ({
            url: i.url,
            storageKey: null,
            altText: i.altText,
            type: i.type,
            isPrimary: i.isPrimary,
            width: i.width,
            height: i.height,
            bytes: i.bytes,
            displayOrder: i.displayOrder,
          })),
        },
      },
      include: PRODUCT_FULL_INCLUDE,
    });

    await log({
      adminId: req.admin?.id,
      action: 'duplicated',
      entity: 'product',
      entityId: copy.id,
      summary: `${source.productName} -> ${copy.sku}`,
    });

    res.status(201).json({ data: adminProduct(copy) });
  }),
);

/* -------------------------------------------------------------- delete ---- */

adminProductsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const hard = req.query.hard === 'true';

    const existing = await prisma.product.findUnique({ where: { id }, include: { images: true } });
    if (!existing) throw notFound('That product no longer exists.');

    if (!hard) {
      const product = await prisma.product.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED', featured: false },
        include: PRODUCT_FULL_INCLUDE,
      });
      await log({
        adminId: req.admin?.id,
        action: 'deleted',
        entity: 'product',
        entityId: id,
        summary: `${existing.productName} archived`,
      });
      res.json({ data: adminProduct(product), meta: { softDeleted: true } });
      return;
    }

    /* Hard delete is ADMIN-only and irreversible. */
    if (req.admin?.role !== 'ADMIN') {
      throw badRequest('Only an administrator can permanently delete a product.');
    }

    for (const image of existing.images) {
      if (image.storageKey) await storage.remove(image.storageKey).catch(() => undefined);
    }
    await prisma.product.delete({ where: { id } });

    await log({
      adminId: req.admin?.id,
      action: 'deleted',
      entity: 'product',
      entityId: id,
      summary: `${existing.productName} permanently deleted`,
    });

    res.json({ data: { ok: true }, meta: { softDeleted: false } });
  }),
);

adminProductsRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const product = await prisma.product.update({
      where: { id },
      data: { deletedAt: null, status: 'DRAFT' },
      include: PRODUCT_FULL_INCLUDE,
    });
    await log({ adminId: req.admin?.id, action: 'restored', entity: 'product', entityId: id, summary: product.productName });
    res.json({ data: adminProduct(product) });
  }),
);

/* ------------------------------------------------------------- reorder ---- */

adminProductsRouter.post(
  '/reorder',
  asyncHandler(async (req, res) => {
    const { ids } = reorderSchema.parse(req.body);
    await prisma.$transaction(
      ids.map((id, index) => prisma.product.update({ where: { id }, data: { displayOrder: index } })),
    );
    await log({ adminId: req.admin?.id, action: 'reordered', entity: 'product', summary: `${ids.length} products` });
    res.json({ data: { ok: true } });
  }),
);

/* --------------------------------------------- features / specifications --- */

adminProductsRouter.put(
  '/:id/features',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const features = z.array(featureInput).max(60).parse(req.body.features ?? req.body);

    await prisma.$transaction(async (tx) => {
      await tx.productFeature.deleteMany({ where: { productId: id } });
      if (features.length) {
        await tx.productFeature.createMany({
          data: features.map((f, i) => ({
            productId: id,
            title: f.title,
            description: f.description ?? null,
            icon: f.icon ?? null,
            displayOrder: f.displayOrder || i,
          })),
        });
      }
    });

    const rows = await prisma.productFeature.findMany({ where: { productId: id }, orderBy: { displayOrder: 'asc' } });
    await log({ adminId: req.admin?.id, action: 'updated', entity: 'product.features', entityId: id });
    res.json({ data: rows });
  }),
);

adminProductsRouter.put(
  '/:id/specifications',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const specs = z.array(specificationInput).max(80).parse(req.body.specifications ?? req.body);

    await prisma.$transaction(async (tx) => {
      await tx.productSpecification.deleteMany({ where: { productId: id } });
      if (specs.length) {
        await tx.productSpecification.createMany({
          data: specs.map((s, i) => ({
            productId: id,
            label: s.label,
            value: s.value,
            displayOrder: s.displayOrder || i,
          })),
        });
      }
    });

    const rows = await prisma.productSpecification.findMany({
      where: { productId: id },
      orderBy: { displayOrder: 'asc' },
    });
    await log({ adminId: req.admin?.id, action: 'updated', entity: 'product.specifications', entityId: id });
    res.json({ data: rows });
  }),
);
