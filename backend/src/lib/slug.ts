/**
 * SEO slugs, and the uniqueness dance around them.
 */
import { prisma } from '../db';

/* U+0300–U+036F: the combining accents NFKD leaves behind. */
const COMBINING_MARKS = new RegExp('[̀-ͯ]', 'g');

/** "WIN WEARS Hybrid Pro X1" -> "win-wears-hybrid-pro-x1" */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    /* Strip the accents so an accented and an unaccented spelling of the same
       name cannot become two different URLs. */
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

async function taken(
  model: 'product' | 'category',
  field: 'slug' | 'sku',
  value: string,
  ignoreId?: string,
): Promise<boolean> {
  const where = { [field]: value, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) } as never;
  const hit =
    model === 'product'
      ? await prisma.product.findFirst({ where, select: { id: true } })
      : await prisma.category.findFirst({ where, select: { id: true } });
  return hit !== null;
}

/**
 * Returns `base`, or `base-2`, `base-3`… until it is free.
 *
 * The unique constraint in the database is still the real guarantee — this
 * only spares the admin an error message in the common case. A collision that
 * slips through the race is caught by the P2002 handler.
 */
export async function uniqueSlug(
  model: 'product' | 'category',
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(desired) || 'item';
  let candidate = base;
  let n = 1;
  while (await taken(model, 'slug', candidate, ignoreId)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/** Same idea for SKUs, which the admin may leave to us when duplicating. */
export async function uniqueSku(desired: string, ignoreId?: string): Promise<string> {
  const base = desired.trim().toUpperCase() || 'WW-SKU';
  let candidate = base;
  let n = 1;
  while (await taken('product', 'sku', candidate, ignoreId)) {
    n += 1;
    candidate = n === 2 ? `${base}-COPY` : `${base}-COPY${n}`;
  }
  return candidate;
}
