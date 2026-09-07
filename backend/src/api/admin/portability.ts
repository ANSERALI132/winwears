/**
 * CSV export, import, and a downloadable template.
 *
 * Import is validate-then-commit: every row is checked first, and nothing is
 * written unless the whole file is clean, so a bad row halfway down cannot
 * leave the catalogue half-updated. Duplicate SKUs are rejected rather than
 * silently overwritten.
 */
import { Router } from 'express';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import { badRequest } from '../../lib/errors';
import { uniqueSlug } from '../../lib/slug';
import { productCreateSchema } from '../../validation/product';
import { csvUpload } from '../../middleware/upload';
import { log } from '../../lib/audit';

export const adminPortabilityRouter = Router();

adminPortabilityRouter.use(csrfProtection);

/** Column order of both the export and the template. */
const COLUMNS = [
  'sku',
  'productName',
  'categorySlug',
  'status',
  'featured',
  'shortDescription',
  'fullDescription',
  'construction',
  'material',
  'usage',
  'size',
  'weight',
  'bladder',
  'panelCount',
  'surface',
  'stitching',
  'technology',
  'customizationAvailable',
  'price',
  'currency',
  'priceLabel',
  'moq',
  'quoteOnly',
  'metaTitle',
  'metaDescription',
  'keywords',
  'displayOrder',
  /* Semicolon-separated. Specifications use label=value pairs. */
  'features',
  'specifications',
] as const;

const YES = new Set(['true', 'yes', '1', 'y']);
const asBool = (v: unknown, fallback = false): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return fallback;
  return YES.has(s);
};
const asText = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim();
  return s.length ? s : undefined;
};

/* --------------------------------------------------------------- export --- */

adminPortabilityRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const rows = await prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      include: { category: true, features: true, specifications: true },
    });

    const records = rows.map((p) => ({
      sku: p.sku,
      productName: p.productName,
      categorySlug: p.category.slug,
      status: p.status,
      featured: p.featured ? 'yes' : 'no',
      shortDescription: p.shortDescription ?? '',
      fullDescription: p.fullDescription ?? '',
      construction: p.construction ?? '',
      material: p.material ?? '',
      usage: p.usage ?? '',
      size: p.size ?? '',
      weight: p.weight ?? '',
      bladder: p.bladder ?? '',
      panelCount: p.panelCount ?? '',
      surface: p.surface ?? '',
      stitching: p.stitching ?? '',
      technology: p.technology ?? '',
      customizationAvailable: p.customizationAvailable ? 'yes' : 'no',
      price: p.price === null ? '' : String(p.price),
      currency: p.currency,
      priceLabel: p.priceLabel ?? '',
      moq: p.moq ?? '',
      quoteOnly: p.quoteOnly ? 'yes' : 'no',
      metaTitle: p.metaTitle ?? '',
      metaDescription: p.metaDescription ?? '',
      keywords: p.keywords ?? '',
      displayOrder: p.displayOrder,
      features: p.features
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((f) => f.title)
        .join('; '),
      specifications: p.specifications
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((s) => `${s.label}=${s.value}`)
        .join('; '),
    }));

    const csv = stringify(records, { header: true, columns: COLUMNS as unknown as string[] });
    const stamp = new Date().toISOString().slice(0, 10);

    await log({ adminId: req.admin?.id, action: 'exported', entity: 'product', summary: `${records.length} products` });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="win-wears-products-${stamp}.csv"`);
    /* Excel opens UTF-8 as the local codepage unless it sees a BOM. */
    res.send('﻿' + csv);
  }),
);

adminPortabilityRouter.get(
  '/template',
  asyncHandler(async (_req, res) => {
    const example = {
      sku: 'WW-HYB-100',
      productName: 'WIN WEARS Pro Match X1',
      categorySlug: 'hybrid-pro-match-ball',
      status: 'DRAFT',
      featured: 'no',
      shortDescription: 'Hybrid match ball for club and academy play.',
      fullDescription: '',
      construction: 'Hybrid',
      material: 'Premium PU',
      usage: 'Match',
      size: '5',
      weight: '',
      bladder: 'Butyl',
      panelCount: '32',
      surface: '',
      stitching: '',
      technology: '',
      customizationAvailable: 'yes',
      price: '',
      currency: 'USD',
      priceLabel: '',
      moq: '100',
      quoteOnly: 'yes',
      metaTitle: '',
      metaDescription: '',
      keywords: '',
      displayOrder: '0',
      features: 'Premium PU outer; High air retention; Custom branding available',
      specifications: 'Construction=Hybrid; Material=PU; Size=5; Bladder=Butyl',
    };

    const csv = stringify([example], { header: true, columns: COLUMNS as unknown as string[] });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="win-wears-product-template.csv"');
    res.send('﻿' + csv);
  }),
);

/* --------------------------------------------------------------- import --- */

interface RowError {
  row: number;
  sku: string;
  errors: string[];
}

adminPortabilityRouter.post(
  '/import',
  csvUpload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Choose a CSV file to import.');

    const dryRun = String(req.query.dryRun ?? req.body?.dryRun ?? '') === 'true';

    let records: Record<string, string>[];
    try {
      records = parse(file.buffer.toString('utf8').replace(/^﻿/, ''), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    } catch {
      throw badRequest('That file could not be read as CSV. Start from the template.');
    }

    if (!records.length) throw badRequest('That file has no rows.');
    if (records.length > 2000) throw badRequest('Import at most 2,000 rows at a time.');

    const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

    const existingSkus = new Set(
      (await prisma.product.findMany({ select: { sku: true } })).map((p) => p.sku.toUpperCase()),
    );
    const seenInFile = new Set<string>();

    const errors: RowError[] = [];
    const prepared: { data: ReturnType<typeof buildRow>; row: number }[] = [];

    function buildRow(raw: Record<string, string>) {
      return {
        productName: asText(raw.productName) ?? '',
        sku: (asText(raw.sku) ?? '').toUpperCase(),
        categoryId: categoryBySlug.get(asText(raw.categorySlug) ?? '') ?? '',
        status: (asText(raw.status)?.toUpperCase() ?? 'DRAFT') as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
        featured: asBool(raw.featured),
        shortDescription: asText(raw.shortDescription),
        fullDescription: asText(raw.fullDescription),
        construction: asText(raw.construction),
        material: asText(raw.material),
        usage: asText(raw.usage),
        size: asText(raw.size),
        weight: asText(raw.weight),
        bladder: asText(raw.bladder),
        panelCount: asText(raw.panelCount),
        surface: asText(raw.surface),
        stitching: asText(raw.stitching),
        technology: asText(raw.technology),
        customizationAvailable: asBool(raw.customizationAvailable, true),
        price: asText(raw.price) ? Number(raw.price) : undefined,
        currency: asText(raw.currency) ?? 'USD',
        priceLabel: asText(raw.priceLabel),
        moq: asText(raw.moq) ? Number(raw.moq) : undefined,
        quoteOnly: asBool(raw.quoteOnly, true),
        metaTitle: asText(raw.metaTitle),
        metaDescription: asText(raw.metaDescription),
        keywords: asText(raw.keywords),
        displayOrder: asText(raw.displayOrder) ? Number(raw.displayOrder) : 0,
        features: (asText(raw.features) ?? '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((title, i) => ({ title, displayOrder: i })),
        specifications: (asText(raw.specifications) ?? '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((pair, i) => {
            const at = pair.indexOf('=');
            return at === -1
              ? { label: pair, value: '', displayOrder: i }
              : { label: pair.slice(0, at).trim(), value: pair.slice(at + 1).trim(), displayOrder: i };
          }),
      };
    }

    records.forEach((raw, index) => {
      const rowNumber = index + 2; /* +1 for the header, +1 for 1-based */
      const candidate = buildRow(raw);
      const rowErrors: string[] = [];

      if (!candidate.sku) rowErrors.push('SKU is required.');
      if (!asText(raw.categorySlug)) rowErrors.push('categorySlug is required.');
      else if (!candidate.categoryId) rowErrors.push(`No category with slug "${raw.categorySlug}".`);

      if (candidate.sku && existingSkus.has(candidate.sku)) {
        rowErrors.push(`SKU ${candidate.sku} already exists. Edit that product instead.`);
      }
      if (candidate.sku && seenInFile.has(candidate.sku)) {
        rowErrors.push(`SKU ${candidate.sku} appears more than once in this file.`);
      }
      if (candidate.sku) seenInFile.add(candidate.sku);

      const parsed = productCreateSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          rowErrors.push(`${issue.path.join('.') || 'row'}: ${issue.message}`);
        }
      }

      if (rowErrors.length) errors.push({ row: rowNumber, sku: candidate.sku || '(none)', errors: rowErrors });
      else prepared.push({ data: candidate, row: rowNumber });
    });

    /* All-or-nothing: a partly-applied import is worse than none. */
    if (errors.length) {
      res.status(422).json({
        error: {
          code: 'IMPORT_FAILED',
          message: `Nothing was imported. ${errors.length} of ${records.length} row${records.length === 1 ? '' : 's'} need attention.`,
        },
        data: { total: records.length, valid: prepared.length, failed: errors.length, errors: errors.slice(0, 100) },
      });
      return;
    }

    if (dryRun) {
      res.json({
        data: { dryRun: true, total: records.length, valid: prepared.length, failed: 0, errors: [] },
      });
      return;
    }

    let created = 0;
    for (const { data } of prepared) {
      const slug = await uniqueSlug('product', data.productName);
      await prisma.product.create({
        data: {
          productName: data.productName,
          slug,
          sku: data.sku,
          categoryId: data.categoryId,
          status: data.status,
          featured: data.featured,
          displayOrder: data.displayOrder,
          shortDescription: data.shortDescription ?? null,
          fullDescription: data.fullDescription ?? null,
          construction: data.construction ?? null,
          material: data.material ?? null,
          usage: data.usage ?? null,
          size: data.size ?? null,
          weight: data.weight ?? null,
          bladder: data.bladder ?? null,
          panelCount: data.panelCount ?? null,
          surface: data.surface ?? null,
          stitching: data.stitching ?? null,
          technology: data.technology ?? null,
          customizationAvailable: data.customizationAvailable,
          price: data.price ?? null,
          currency: data.currency,
          priceLabel: data.priceLabel ?? null,
          moq: data.moq ?? null,
          quoteOnly: data.quoteOnly,
          metaTitle: data.metaTitle ?? null,
          metaDescription: data.metaDescription ?? null,
          keywords: data.keywords ?? null,
          publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
          features: { create: data.features },
          specifications: { create: data.specifications.filter((s) => s.label && s.value) },
        },
      });
      created += 1;
    }

    await log({ adminId: req.admin?.id, action: 'imported', entity: 'product', summary: `${created} products from CSV` });

    res.status(201).json({
      data: { dryRun: false, total: records.length, created, failed: 0, errors: [] },
    });
  }),
);
