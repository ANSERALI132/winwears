/**
 * Product gallery: upload, edit, reorder, delete.
 *
 * Every uploaded byte is sniffed before it reaches a storage driver, and the
 * "exactly one primary image" rule is enforced in a transaction rather than
 * trusted to the caller.
 */
import { Router } from 'express';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { badRequest, notFound } from '../../lib/errors';
import { upload } from '../../middleware/upload';
import { assertAllowed, ALLOWED_IMAGE_TYPES } from '../../lib/fileType';
import { storage } from '../../lib/storage';
import { imageMetaSchema, imageUpdateSchema, reorderSchema } from '../../validation/product';
import { log } from '../../lib/audit';

export const adminImagesRouter = Router({ mergeParams: true });

adminImagesRouter.use(csrfProtection);

/** Makes `imageId` the only primary image on `productId`. */
async function setPrimary(productId: string, imageId: string): Promise<void> {
  await prisma.$transaction([
    prisma.productImage.updateMany({ where: { productId }, data: { isPrimary: false } }),
    prisma.productImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
  ]);
}

adminImagesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const productId = String(req.params.productId);
    const rows = await prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ data: rows });
  }),
);

adminImagesRouter.post(
  '/',
  upload.array('images', 20),
  asyncHandler(async (req, res) => {
    const productId = String(req.params.productId);
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, productName: true },
    });
    if (!product) throw notFound('That product no longer exists.');

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw badRequest('Choose at least one image to upload.');

    const meta = imageMetaSchema.parse(req.body);
    const existingCount = await prisma.productImage.count({ where: { productId } });

    const created = [];
    for (const [i, file] of files.entries()) {
      /* Images only here — a PDF is fine on a quote, not in a gallery. */
      const contentType = assertAllowed(file.buffer, ALLOWED_IMAGE_TYPES);
      const saved = await storage.put({
        buffer: file.buffer,
        filename: file.originalname,
        contentType,
        prefix: `products/${productId}`,
      });

      const row = await prisma.productImage.create({
        data: {
          productId,
          url: saved.url,
          storageKey: saved.key,
          altText: meta.altText ?? `${product.productName}`,
          type: meta.type,
          /* The very first image a product ever gets becomes its primary,
             so a gallery is never left without one. */
          isPrimary: existingCount === 0 && i === 0,
          bytes: saved.bytes,
          displayOrder: existingCount + i,
        },
      });
      created.push(row);
    }

    await log({
      adminId: req.admin?.id,
      action: 'uploaded',
      entity: 'product.images',
      entityId: productId,
      summary: `${created.length} image${created.length === 1 ? '' : 's'} for ${product.productName}`,
    });

    res.status(201).json({ data: created });
  }),
);

adminImagesRouter.patch(
  '/:imageId',
  asyncHandler(async (req, res) => {
    const productId = String(req.params.productId);
    const imageId = String(req.params.imageId);
    const input = imageUpdateSchema.parse(req.body);

    const existing = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!existing) throw notFound('That image no longer exists.');

    if (input.isPrimary === true) await setPrimary(productId, imageId);

    const image = await prisma.productImage.update({
      where: { id: imageId },
      data: {
        ...(input.altText !== undefined ? { altText: input.altText } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
      },
    });

    res.json({ data: image });
  }),
);

adminImagesRouter.post(
  '/reorder',
  asyncHandler(async (req, res) => {
    const productId = String(req.params.productId);
    const { ids } = reorderSchema.parse(req.body);

    /* Only reorder rows that really belong to this product, so a crafted id
       list cannot renumber somebody else's gallery. */
    const owned = await prisma.productImage.findMany({ where: { productId, id: { in: ids } }, select: { id: true } });
    const ownedIds = new Set(owned.map((r) => r.id));

    await prisma.$transaction(
      ids
        .filter((id) => ownedIds.has(id))
        .map((id, index) => prisma.productImage.update({ where: { id }, data: { displayOrder: index } })),
    );

    const rows = await prisma.productImage.findMany({ where: { productId }, orderBy: { displayOrder: 'asc' } });
    res.json({ data: rows });
  }),
);

adminImagesRouter.delete(
  '/:imageId',
  asyncHandler(async (req, res) => {
    const productId = String(req.params.productId);
    const imageId = String(req.params.imageId);

    const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw notFound('That image no longer exists.');

    /* Only remove the stored object when this row owns it. A duplicated
       product shares its parent's URLs with storageKey left null. */
    if (image.storageKey) await storage.remove(image.storageKey).catch(() => undefined);
    await prisma.productImage.delete({ where: { id: imageId } });

    /* Never leave a gallery with no primary. */
    if (image.isPrimary) {
      const next = await prisma.productImage.findFirst({
        where: { productId },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next) await prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
    }

    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'product.images', entityId: productId });
    res.json({ data: { ok: true } });
  }),
);
