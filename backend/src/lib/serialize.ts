/**
 * Prisma rows -> public JSON.
 *
 * One place decides what leaves the server, which is how internal notes,
 * soft-delete timestamps and price data on quote-only products stay in.
 */
import type { Category, Product, ProductFeature, ProductImage, ProductSpecification } from '@prisma/client';

export type FullProduct = Product & {
  category?: Category | null;
  features?: ProductFeature[];
  specifications?: ProductSpecification[];
  images?: ProductImage[];
};

function orderedImages(images: ProductImage[] = []) {
  return [...images].sort((a, b) => {
    /* Primary first, then the admin's order, then upload order. */
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function publicCategory(c: Category) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    shortDescription: c.shortDescription,
    description: c.description,
    image: c.image,
    displayOrder: c.displayOrder,
    seo: { title: c.metaTitle, description: c.metaDescription },
  };
}

/** Message pre-filled for the WhatsApp deep link on a product page. */
export function whatsappMessage(productName: string, sku: string): string {
  return `Hello WIN WEARS, I am interested in ${productName} (${sku}). Please send me product details and quotation.`;
}

export function publicProduct(p: FullProduct) {
  const images = orderedImages(p.images ?? []);
  const primary = images.find((i) => i.isPrimary) ?? images[0] ?? null;

  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    productName: p.productName,
    shortDescription: p.shortDescription,
    fullDescription: p.fullDescription,
    featured: p.featured,
    displayOrder: p.displayOrder,
    publishedAt: p.publishedAt,

    category: p.category
      ? { id: p.category.id, name: p.category.name, slug: p.category.slug }
      : { id: p.categoryId, name: null, slug: null },

    details: {
      construction: p.construction,
      material: p.material,
      usage: p.usage,
      size: p.size,
      weight: p.weight,
      bladder: p.bladder,
      panelCount: p.panelCount,
      surface: p.surface,
      stitching: p.stitching,
      technology: p.technology,
      customizationAvailable: p.customizationAvailable,
      customizationNotes: p.customizationNotes,
    },

    commercial: {
      quoteOnly: p.quoteOnly,
      /* A quote-only product never publishes a number, whatever is stored. */
      price: p.quoteOnly || p.price === null ? null : Number(p.price),
      currency: p.currency,
      priceLabel: p.priceLabel ?? (p.quoteOnly ? 'Price on request' : null),
      moq: p.moq,
    },

    features: (p.features ?? [])
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((f) => ({ id: f.id, title: f.title, description: f.description, icon: f.icon })),

    specifications: (p.specifications ?? [])
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((s) => ({ id: s.id, label: s.label, value: s.value })),

    images: images.map((i) => ({
      id: i.id,
      url: i.url,
      altText: i.altText ?? `${p.productName} — ${i.type.toLowerCase()}`,
      type: i.type,
      isPrimary: i.isPrimary,
    })),
    primaryImage: primary ? primary.url : null,

    seo: {
      title: p.metaTitle ?? `${p.productName} | WIN WEARS`,
      description: p.metaDescription ?? p.shortDescription ?? null,
      keywords: p.keywords,
      ogImage: p.ogImage ?? primary?.url ?? null,
    },

    whatsappMessage: whatsappMessage(p.productName, p.sku),
  };
}

/** Trimmed shape for grids and search results. */
export function productCard(p: FullProduct) {
  const images = orderedImages(p.images ?? []);
  const primary = images.find((i) => i.isPrimary) ?? images[0] ?? null;
  return {
    id: p.id,
    slug: p.slug,
    sku: p.sku,
    productName: p.productName,
    shortDescription: p.shortDescription,
    featured: p.featured,
    category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
    construction: p.construction,
    material: p.material,
    usage: p.usage,
    size: p.size,
    customizationAvailable: p.customizationAvailable,
    commercial: {
      quoteOnly: p.quoteOnly,
      price: p.quoteOnly || p.price === null ? null : Number(p.price),
      currency: p.currency,
      priceLabel: p.priceLabel ?? (p.quoteOnly ? 'Price on request' : null),
    },
    primaryImage: primary ? primary.url : null,
    secondaryImage: images[1]?.url ?? null,
    images: images.slice(0, 6).map((i) => ({ url: i.url, altText: i.altText })),
    whatsappMessage: whatsappMessage(p.productName, p.sku),
  };
}

/** Admin views need the fields the public shape deliberately drops. */
export function adminProduct(p: FullProduct) {
  return {
    ...publicProduct(p),
    status: p.status,
    deletedAt: p.deletedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    categoryId: p.categoryId,
    rawPrice: p.price === null ? null : Number(p.price),
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
  };
}
