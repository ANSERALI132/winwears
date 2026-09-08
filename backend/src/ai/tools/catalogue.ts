/**
 * Catalogue tools.
 *
 * Everything the agent can learn about footballs. All reads go through
 * buildProductWhere with publicOnly, the same helper the public site uses, so
 * the agent and the website can never disagree about what is published — and
 * a draft cannot be recommended by a chat window that a visitor cannot reach
 * through the catalogue.
 */
import { z } from 'zod';
import { prisma } from '../../db';
import { buildProductWhere, buildProductOrderBy, PRODUCT_FULL_INCLUDE } from '../../lib/productQuery';
import { env } from '../../env';
import { compact, type AITool } from './types';

/** Public product page. The agent hands this to the customer as "View
 *  Product", so it must match what the site actually serves. */
function productUrl(slug: string): string {
  return `${env.PUBLIC_BASE_URL}/product.html?slug=${encodeURIComponent(slug)}`;
}

/* The row shape is whatever PRODUCT_FULL_INCLUDE produces. Restating that as
   a type here would duplicate the include and drift from it, so the shapers
   take the row loosely and the compiler checks the callers instead. */
type Row = Record<string, any>;

/** Search-result shape: enough to recommend and to render a card, no more.
 *  Absent fields are absent from the record — see compact(). */
function toSummary(p: Row) {
  const images = [...(p.images ?? [])].sort(
    (a: Row, b: Row) => Number(b.isPrimary) - Number(a.isPrimary) || a.displayOrder - b.displayOrder,
  );
  return compact({
    name: p.productName,
    /* The handle the model quotes back to other tools. Deliberately the slug
       and SKU rather than the database id, which is nobody's business. */
    slug: p.slug,
    sku: p.sku,
    category: p.category?.name ?? null,
    description: p.shortDescription,
    construction: p.construction,
    material: p.material,
    usage: p.usage,
    size: p.size,
    customizationAvailable: p.customizationAvailable,
    moq: p.moq,
    price: p.quoteOnly ? (p.priceLabel ?? 'Price on request') : p.priceLabel,
    image: images[0]?.url ?? null,
    url: productUrl(p.slug),
  });
}

/** Everything on the record, for a question about one ball. */
function toDetail(p: Row) {
  return compact({
    ...toSummary(p),
    fullDescription: p.fullDescription,
    weight: p.weight,
    bladder: p.bladder,
    panelCount: p.panelCount,
    surface: p.surface,
    stitching: p.stitching,
    technology: p.technology,
    customizationNotes: p.customizationNotes,
    features: (p.features ?? [])
      .sort((a: Row, b: Row) => a.displayOrder - b.displayOrder)
      .map((f: Row) => compact({ title: f.title, description: f.description })),
    specifications: (p.specifications ?? [])
      .sort((a: Row, b: Row) => a.displayOrder - b.displayOrder)
      .map((s: Row) => ({ label: s.label, value: s.value })),
    images: (p.images ?? []).length,
  });
}

/* ------------------------------------------------------------- search ----- */

const searchInput = z.object({
  query: z.string().trim().max(120).optional().describe('Free text: name, SKU, material, construction or category'),
  category: z.string().trim().max(120).optional(),
  construction: z.string().trim().max(160).optional(),
  material: z.string().trim().max(160).optional(),
  usage: z.string().trim().max(160).optional(),
  size: z.string().trim().max(64).optional(),
  customizationOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(12).default(6),
});

export const searchProducts: AITool<z.infer<typeof searchInput>> = {
  definition: {
    name: 'search_products',
    description:
      'Search the WIN WEARS football catalogue. Use this before answering any question about which balls exist, what they are made of, or what suits a customer. Returns only published products. An empty result means nothing matches — say so rather than inventing a product.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text: product name, SKU, material, construction or category' },
        category: { type: 'string', description: 'Category name or slug, e.g. "Thermal Bonded Match Ball"' },
        construction: { type: 'string' },
        material: { type: 'string' },
        usage: { type: 'string', description: 'Intended use, e.g. "Professional Match", "Training"' },
        size: { type: 'string', description: 'Ball size, e.g. "5"' },
        customizationOnly: { type: 'boolean', description: 'Only balls that can carry a customer logo' },
        limit: { type: 'integer', minimum: 1, maximum: 12, description: 'Default 6' },
      },
      additionalProperties: false,
    },
  },
  schema: searchInput,
  async run(input) {
    const where = buildProductWhere(
      {
        q: input.query ?? null,
        category: input.category ?? null,
        construction: input.construction ?? null,
        material: input.material ?? null,
        usage: input.usage ?? null,
        size: input.size ?? null,
        customization: input.customizationOnly ? 'yes' : undefined,
        includeDeleted: 'no',
        sort: 'order',
        page: 1,
        perPage: input.limit,
      } as Parameters<typeof buildProductWhere>[0],
      { publicOnly: true },
    );

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: buildProductOrderBy('order'),
        take: input.limit,
        include: PRODUCT_FULL_INCLUDE,
      }),
    ]);

    return {
      matched: total,
      showing: rows.length,
      products: rows.map(toSummary),
      ...(total === 0
        ? { note: 'No published product matches. Do not invent one; offer to connect the customer with the WIN WEARS team.' }
        : {}),
    };
  },
};

/* ---------------------------------------------------------------- one ----- */

const getInput = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  sku: z.string().trim().min(1).max(64).optional(),
});

export const getProduct: AITool<z.infer<typeof getInput>> = {
  definition: {
    name: 'get_product',
    description:
      'Full record for one football, including every feature and specification held for it. Identify it by slug (preferred) or SKU, both of which come from search_products.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Product slug from a previous search' },
        sku: { type: 'string', description: 'Product SKU, if the slug is not known' },
      },
      additionalProperties: false,
    },
  },
  schema: getInput,
  async run(input) {
    if (!input.slug && !input.sku) return { error: 'Provide either slug or sku.' };

    const product = await prisma.product.findFirst({
      where: {
        AND: [
          { status: 'PUBLISHED', deletedAt: null },
          input.slug ? { slug: input.slug } : { sku: input.sku as string },
        ],
      },
      include: PRODUCT_FULL_INCLUDE,
    });

    if (!product) {
      return {
        found: false,
        note: 'No published product with that identifier. Do not describe it from memory.',
      };
    }
    return { found: true, product: toDetail(product) };
  },
};

/* ------------------------------------------------------------ compare ----- */

const compareInput = z.object({
  slugs: z.array(z.string().trim().min(1).max(120)).min(2).max(4),
});

export const compareProducts: AITool<z.infer<typeof compareInput>> = {
  definition: {
    name: 'compare_products',
    description:
      'Compare two to four footballs side by side. Use when a customer asks about the difference between balls or ranges. Returns each product\'s record; compare only on fields that are actually present.',
    inputSchema: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: 'Product slugs from search_products',
        },
      },
      required: ['slugs'],
      additionalProperties: false,
    },
  },
  schema: compareInput,
  async run(input) {
    const rows = await prisma.product.findMany({
      where: { AND: [{ status: 'PUBLISHED', deletedAt: null }, { slug: { in: input.slugs } }] },
      include: PRODUCT_FULL_INCLUDE,
    });

    const found = rows.map((r) => r.slug);
    const missing = input.slugs.filter((s) => !found.includes(s));

    return {
      products: rows.map(toDetail),
      ...(missing.length ? { missing, note: 'These slugs are not published products.' } : {}),
    };
  },
};

/* --------------------------------------------------------- categories ----- */

const categoriesInput = z.object({
  query: z.string().trim().max(120).optional(),
});

export const searchCategories: AITool<z.infer<typeof categoriesInput>> = {
  definition: {
    name: 'search_categories',
    description:
      'List the WIN WEARS football ranges, with how many published balls each holds. Use this to orient a customer who has not said what they want.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Optional name filter' } },
      additionalProperties: false,
    },
  },
  schema: categoriesInput,
  async run(input) {
    const rows = await prisma.category.findMany({
      where: {
        active: true,
        ...(input.query ? { name: { contains: input.query, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { status: 'PUBLISHED', deletedAt: null } } } },
      },
    });

    return {
      categories: rows.map((c) =>
        compact({
          name: c.name,
          slug: c.slug,
          description: c.shortDescription ?? c.description,
          productCount: c._count.products,
        }),
      ),
    };
  },
};

/* ------------------------------------------------- features and specs ----- */

const bySlug = z.object({ slug: z.string().trim().min(1).max(120) });

export const getProductFeatures: AITool<z.infer<typeof bySlug>> = {
  definition: {
    name: 'get_product_features',
    description: 'The selling features recorded for one football. Returns an empty list when none are recorded — that means none are confirmed, not that the ball has none worth mentioning.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  schema: bySlug,
  async run(input) {
    const product = await prisma.product.findFirst({
      where: { slug: input.slug, status: 'PUBLISHED', deletedAt: null },
      include: { features: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!product) return { found: false };
    return {
      found: true,
      product: product.productName,
      features: product.features.map((f) => compact({ title: f.title, description: f.description })),
    };
  },
};

export const getProductSpecifications: AITool<z.infer<typeof bySlug>> = {
  definition: {
    name: 'get_product_specifications',
    description:
      'The specification sheet recorded for one football. These are the only specifications that may be quoted. If a customer asks about something not listed, it is not confirmed.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  schema: bySlug,
  async run(input) {
    const product = await prisma.product.findFirst({
      where: { slug: input.slug, status: 'PUBLISHED', deletedAt: null },
      include: { specifications: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!product) return { found: false };
    return {
      found: true,
      product: product.productName,
      specifications: product.specifications.map((s) => ({ label: s.label, value: s.value })),
    };
  },
};
