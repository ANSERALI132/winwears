/**
 * Turns filter query-strings into Prisma `where` / `orderBy`.
 *
 * Shared by the public catalogue and the admin table so the two can never
 * disagree about what "published" or "featured" means.
 */
import { Prisma } from '@prisma/client';
import type { ProductListQuery } from '../validation/product';

export const PRODUCT_INCLUDE = {
  category: true,
  images: true,
} satisfies Prisma.ProductInclude;

export const PRODUCT_FULL_INCLUDE = {
  category: true,
  images: true,
  features: true,
  specifications: true,
} satisfies Prisma.ProductInclude;

interface BuildOptions {
  /** Public callers only ever see published, undeleted rows. */
  publicOnly: boolean;
}

export function buildProductWhere(q: ProductListQuery, opts: BuildOptions): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (opts.publicOnly) {
    and.push({ status: 'PUBLISHED', deletedAt: null });
  } else {
    if (q.status) and.push({ status: q.status });
    if (q.includeDeleted !== 'yes') and.push({ deletedAt: null });
  }

  if (q.category) {
    and.push({ category: { OR: [{ slug: q.category }, { id: q.category }] } });
  }

  /* `equals` with insensitive mode, not `contains`: filter chips come from the
     distinct values we published, so a partial match would only add surprises. */
  const exact = (field: 'construction' | 'material' | 'usage', value?: string | null) => {
    if (value) and.push({ [field]: { equals: value, mode: 'insensitive' } } as Prisma.ProductWhereInput);
  };
  exact('construction', q.construction);
  exact('material', q.material);
  exact('usage', q.usage);

  /* Size is stored as free text like "5" or "3, 4, 5", so a contains match is
     the honest one here. */
  if (q.size) and.push({ size: { contains: q.size, mode: 'insensitive' } });

  if (q.customization) and.push({ customizationAvailable: q.customization === 'yes' });
  if (q.featured) and.push({ featured: q.featured === 'yes' });

  /* A standalone range is a category with no parent and no children, so the
     football collection never lists a kit from a group like Soccer Uniforms. */
  if (q.ranges === 'yes') and.push({ category: { parentId: null, children: { none: {} } } });

  if (q.q) {
    const term = q.q.trim();
    and.push({
      OR: [
        { productName: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { shortDescription: { contains: term, mode: 'insensitive' } },
        { construction: { contains: term, mode: 'insensitive' } },
        { material: { contains: term, mode: 'insensitive' } },
        { usage: { contains: term, mode: 'insensitive' } },
        { technology: { contains: term, mode: 'insensitive' } },
        { category: { name: { contains: term, mode: 'insensitive' } } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export function buildProductOrderBy(sort: ProductListQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'newest':
      return [{ createdAt: 'desc' }];
    case 'oldest':
      return [{ createdAt: 'asc' }];
    case 'name':
      return [{ productName: 'asc' }];
    case 'name-desc':
      return [{ productName: 'desc' }];
    case 'updated':
      return [{ updatedAt: 'desc' }];
    case 'order':
    default:
      /* Featured first, then the admin's manual order, then newest. */
      return [{ featured: 'desc' }, { displayOrder: 'asc' }, { createdAt: 'desc' }];
  }
}
