/**
 * Documents attached to business records.
 *
 * Files are stored privately and read back only through this router, which
 * sits behind the admin guard. A product photograph is public by design; a
 * customer's artwork or a signed purchase order is not, and an unguessable
 * URL is not privacy — it is a password that gets forwarded in an email
 * thread.
 *
 * What is uploaded is sniffed, not trusted: the declared media type and the
 * filename extension are both ignored in favour of the actual bytes, so a
 * script renamed to .pdf is refused rather than stored.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { upload } from '../../middleware/upload';
import { badRequest, notFound } from '../../lib/errors';
import { assertAllowed, ALLOWED_UPLOAD_TYPES } from '../../lib/fileType';
import { putDocument, readDocument, removeDocument } from '../../lib/documents';
import { log } from '../../lib/audit';
import { pagination } from '../../validation/common';

export const adminAttachmentsRouter = Router();

adminAttachmentsRouter.use(csrfProtection);

/**
 * What a document may be attached to.
 *
 * A closed list rather than any string: `entity` is written by the client, and
 * an open field would let somebody file a document against a record type
 * nothing displays, where it would sit unseen and undeleted forever.
 */
const ENTITIES = [
  'order', 'quotation', 'quote request', 'company', 'contact',
  'opportunity', 'production run', 'inspection', 'shipment', 'product',
] as const;

const entity = z.enum(ENTITIES);

const listQuery = pagination.extend({
  entity: entity.optional(),
  entityId: z.string().min(1).max(64).optional(),
});

const uploadFields = z.object({
  entity,
  entityId: z.string().min(1).max(64),
  title: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const updateSchema = z.object({
  title: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/** What the browser needs. Never the storage key: it is the handle to the
 *  file on disk and has no business travelling to a page. */
function serialise(a: {
  id: string; entity: string; entityId: string; filename: string; contentType: string;
  bytes: number; title: string | null; notes: string | null; createdAt: Date;
  uploadedBy?: { id: string; name: string } | null;
}) {
  return {
    id: a.id,
    entity: a.entity,
    entityId: a.entityId,
    filename: a.filename,
    contentType: a.contentType,
    bytes: a.bytes,
    title: a.title,
    notes: a.notes,
    createdAt: a.createdAt,
    uploadedBy: a.uploadedBy ?? null,
    /* Built here so no screen has to know how downloads are addressed. */
    href: `/api/admin/attachments/${a.id}/download`,
  };
}

adminAttachmentsRouter.get(
  '/kinds',
  asyncHandler(async (_req, res) => {
    res.json({ data: { entities: [...ENTITIES], accepts: [...ALLOWED_UPLOAD_TYPES] } });
  }),
);

adminAttachmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);

    const where = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.attachment.count({ where }),
      prisma.attachment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: { uploadedBy: { select: { id: true, name: true } } },
      }),
    ]);

    res.json({
      data: rows.map(serialise),
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminAttachmentsRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    /* Multer's filter drops a file with a type outside the allow-list, which
       arrives here indistinguishable from no file at all. Say both, because
       "choose a file" to somebody who just chose one is a dead end. */
    if (!req.file) {
      throw badRequest('No file was accepted. Attach a PDF or an image — a .doc or .zip is not stored here.');
    }
    const input = uploadFields.parse(req.body);

    /* The bytes decide. A declared media type and a filename extension are
       both things the uploader chose, and neither is evidence. */
    const contentType = assertAllowed(req.file.buffer);

    const stored = await putDocument({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType,
    });

    const row = await prisma.attachment.create({
      data: {
        entity: input.entity,
        entityId: input.entityId,
        /* Kept for display only. The stored path is generated. */
        filename: req.file.originalname.slice(0, 200),
        storageKey: stored.key,
        contentType: stored.contentType,
        bytes: stored.bytes,
        title: input.title || null,
        notes: input.notes || null,
        uploadedById: req.admin?.id ?? null,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    await log({
      adminId: req.admin?.id,
      action: 'uploaded',
      entity: 'document',
      entityId: row.id,
      summary: `${row.filename} on ${input.entity}`,
    });

    res.status(201).json({ data: serialise(row) });
  }),
);

/**
 * Streams the file back.
 *
 * Behind the admin guard like everything else in this router, which is the
 * whole reason these are not served from a public directory.
 */
adminAttachmentsRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) => {
    const row = await prisma.attachment.findUnique({ where: { id: String(req.params.id) } });
    if (!row) throw notFound('That document no longer exists.');

    let body: Buffer;
    try {
      body = await readDocument(row.storageKey);
    } catch {
      /* The row outlived the file. Say so rather than returning an empty
         download that looks like a corrupt document. */
      throw notFound('That file is missing from storage. The record is still here, but the file is not.');
    }

    /* attachment, not inline: a PDF rendered in the tab is a PDF that can
       script against this origin. The filename is quoted and stripped of
       anything that could break out of the header. */
    const safe = row.filename.replace(/["\\\r\n]/g, '_');
    res.setHeader('Content-Type', row.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
    res.setHeader('Content-Length', String(body.byteLength));
    /* Somebody else's confidential document must not sit in a shared cache. */
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }),
);

adminAttachmentsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = updateSchema.parse(req.body);

    const existing = await prisma.attachment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('That document no longer exists.');

    const row = await prisma.attachment.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    res.json({ data: serialise(row) });
  }),
);

adminAttachmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.attachment.findUnique({ where: { id } });
    if (!existing) throw notFound('That document no longer exists.');

    /* Row first: a file left on disk with no row is invisible clutter, while
       a row with no file is a broken download that says so. Of the two ways
       to fail, the visible one is better. */
    await prisma.attachment.delete({ where: { id } });
    await removeDocument(existing.storageKey);

    await log({
      adminId: req.admin?.id,
      action: 'deleted',
      entity: 'document',
      entityId: id,
      summary: `${existing.filename} from ${existing.entity}`,
    });

    res.status(204).end();
  }),
);
