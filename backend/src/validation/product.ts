import { z } from 'zod';
import { boolish, optionalLongText, optionalText, pagination, requiredText } from './common';

export const productStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const imageType = z.enum(['MAIN', 'GALLERY', 'DETAIL', 'CONSTRUCTION', 'LIFESTYLE', 'PACKAGING']);

export const featureInput = z.object({
  id: z.string().optional(),
  title: requiredText('Feature title', 160),
  description: optionalText(2000),
  icon: optionalText(64),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

export const specificationInput = z.object({
  id: z.string().optional(),
  label: requiredText('Specification label', 120),
  value: requiredText('Specification value', 400),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

/**
 * Everything an admin can set on a product.
 *
 * The technical fields are free text on purpose: they are the manufacturer's
 * own values, and pinning them to an enum would mean editing code every time a
 * new construction or bladder is offered.
 */
export const productCreateSchema = z.object({
  productName: requiredText('Product name', 160),
  slug: optionalText(120),
  sku: requiredText('SKU', 64).transform((v) => v.toUpperCase()),
  shortDescription: optionalText(400),
  fullDescription: optionalLongText(),
  categoryId: requiredText('Category', 64),
  status: productStatus.default('DRAFT'),
  featured: boolish.default(false),
  displayOrder: z.coerce.number().int().min(0).default(0),

  construction: optionalText(160),
  material: optionalText(160),
  usage: optionalText(160),
  size: optionalText(64),
  weight: optionalText(64),
  bladder: optionalText(120),
  panelCount: optionalText(64),
  surface: optionalText(160),
  stitching: optionalText(160),
  technology: optionalText(300),
  customizationAvailable: boolish.default(true),
  customizationNotes: optionalLongText(4000),

  price: z.coerce.number().nonnegative().max(1_000_000).optional(),
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  priceLabel: optionalText(80),
  moq: z.coerce.number().int().min(1).max(10_000_000).optional(),
  quoteOnly: boolish.default(true),

  metaTitle: optionalText(200),
  metaDescription: optionalText(400),
  keywords: optionalText(400),
  ogImage: optionalText(500),

  features: z.array(featureInput).max(60).default([]),
  specifications: z.array(specificationInput).max(80).default([]),
});

/** Every field optional, but at least one present. */
export const productUpdateSchema = productCreateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Nothing to update.' },
);

export const productListQuery = pagination.extend({
  q: optionalText(120),
  category: optionalText(120),
  construction: optionalText(160),
  material: optionalText(160),
  usage: optionalText(160),
  size: optionalText(64),
  customization: z.enum(['yes', 'no']).optional(),
  featured: z.enum(['yes', 'no']).optional(),
  status: productStatus.optional(),
  includeDeleted: z.enum(['yes', 'no']).default('no'),
  sort: z
    .enum(['newest', 'oldest', 'name', 'name-desc', 'order', 'updated'])
    .default('order'),
});

export const imageMetaSchema = z.object({
  altText: optionalText(300),
  type: imageType.default('GALLERY'),
  isPrimary: boolish.default(false),
});

export const imageUpdateSchema = z.object({
  altText: optionalText(300).nullable().optional(),
  type: imageType.optional(),
  isPrimary: boolish.optional(),
});

export const reorderSchema = z.object({
  /** Ids in their new order. */
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductListQuery = z.infer<typeof productListQuery>;
