/**
 * Seed.
 *
 * Creates the four categories and the default settings, then migrates the
 * existing catalogue out of frontend/assets/js/data/products.js so nothing
 * built so far is lost. Re-running is safe: everything is keyed on slug or
 * SKU and upserted.
 *
 * No invented products, no invented specifications. Where the old data file
 * had no value for a field, the field is left empty for the admin to fill in.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { PrismaClient, type ProductStatus } from '@prisma/client';
import { SETTING_DEFAULTS } from '../src/lib/settings';
import { slugify } from '../src/lib/slug';

const prisma = new PrismaClient();

/* ------------------------------------------------- the old data file ------ */

interface LegacyCategory {
  slug: string;
  key: string;
  name: string;
  short: string;
  blurb: string;
  construction: string;
  material: string;
  bladder: string;
  panels: string;
  sizes: string;
  usage: string;
}

interface LegacyProduct {
  id: string;
  sku: string;
  cat: string;
  name: string;
  colour: string;
  shots: number;
  usage: string;
  status: 'public' | 'hidden';
  flag?: string;
  note?: string;
}

interface Legacy {
  CATEGORIES: LegacyCategory[];
  PRODUCTS: LegacyProduct[];
}

/**
 * The catalogue file is a browser script that assigns to `window.WW`. Running
 * it in a VM with a stub window is the least fragile way to read it — parsing
 * it by hand would break the moment a quote or a comment moved.
 */
function readLegacy(): Legacy | null {
  const file = path.resolve(__dirname, '..', '..', 'frontend', 'assets', 'js', 'data', 'products.js');
  if (!fs.existsSync(file)) return null;

  const sandbox: { window: Record<string, unknown> } = { window: {} };
  vm.createContext(sandbox);
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { timeout: 5000 });
  } catch (err) {
    console.warn('  ! could not evaluate products.js, skipping migration:', err);
    return null;
  }

  const ww = sandbox.window.WW_SNAPSHOT as Legacy | undefined;
  if (!ww?.CATEGORIES || !ww?.PRODUCTS) return null;
  return ww;
}

/* ------------------------------------------------------------ categories -- */

/** Used when the old data file is unavailable. Names only — the descriptive
 *  copy comes from the file when it is there. */
const FALLBACK_CATEGORIES = [
  { name: 'Hybrid Pro Match Ball', slug: 'hybrid-pro-match-ball' },
  { name: 'Hand Made Match Ball', slug: 'hand-made-match-ball' },
  { name: 'Thermal Bonded Match Ball', slug: 'thermal-bonded-match-ball' },
  { name: 'TPU Ball', slug: 'tpu-ball' },
];

async function seedSettings(): Promise<void> {
  for (const d of SETTING_DEFAULTS) {
    await prisma.setting.upsert({
      where: { key: d.key },
      create: { key: d.key, value: d.value, group: d.group, label: d.label },
      /* Only the label and group are refreshed — an admin's edited value is
         never overwritten by re-seeding. */
      update: { group: d.group, label: d.label },
    });
  }
  console.log(`  settings      ${SETTING_DEFAULTS.length} keys`);
}

async function seedCategories(legacy: Legacy | null): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();

  const rows = legacy
    ? legacy.CATEGORIES.map((c, i) => ({
        key: c.key,
        slug: c.slug,
        name: c.name,
        shortDescription: c.short ?? null,
        description: c.blurb ?? null,
        displayOrder: i,
      }))
    : FALLBACK_CATEGORIES.map((c, i) => ({
        key: c.slug,
        slug: c.slug,
        name: c.name,
        shortDescription: null,
        description: null,
        displayOrder: i,
      }));

  for (const r of rows) {
    const category = await prisma.category.upsert({
      where: { slug: r.slug },
      create: {
        name: r.name,
        slug: r.slug,
        shortDescription: r.shortDescription,
        description: r.description,
        displayOrder: r.displayOrder,
        active: true,
      },
      update: { name: r.name, displayOrder: r.displayOrder },
    });
    byKey.set(r.key, category.id);
    byKey.set(r.slug, category.id);
  }

  console.log(`  categories    ${rows.length}`);
  return byKey;
}

/* -------------------------------------------------------------- products -- */

async function seedProducts(legacy: Legacy, categoryIds: Map<string, string>): Promise<void> {
  const catByKey = new Map(legacy.CATEGORIES.map((c) => [c.key, c]));
  let created = 0;
  let skipped = 0;
  let drafted = 0;

  for (const [index, p] of legacy.PRODUCTS.entries()) {
    const categoryId = categoryIds.get(p.cat);
    if (!categoryId) {
      skipped += 1;
      continue;
    }

    const existing = await prisma.product.findUnique({ where: { sku: p.sku }, select: { id: true } });
    if (existing) {
      skipped += 1;
      continue;
    }

    const cat = catByKey.get(p.cat);

    /* The old file hid 20 products because their photographs carry another
       company's trademark or a certification mark. They come across as drafts
       with the reason recorded, so the decision to publish stays a human one. */
    const isHidden = p.status !== 'public';
    const status: ProductStatus = isHidden ? 'DRAFT' : 'PUBLISHED';
    if (isHidden) drafted += 1;

    const slug = slugify(`${p.name} ${p.colour} ${p.sku}`);

    /* Specifications carried over from the category sheet the old site
       rendered. Category-level values, marked as indicative there and fully
       editable here — nothing new is asserted. */
    const specs = [
      ['Category', cat?.name],
      ['Construction', cat?.construction],
      ['Outer material', cat?.material],
      ['Bladder', cat?.bladder],
      ['Panels', p.note ?? cat?.panels],
      ['Sizes', cat?.sizes],
      ['Intended use', p.usage || cat?.usage],
      ['Colourway', p.colour],
    ].filter((row): row is [string, string] => Boolean(row[1]));

    const images = Array.from({ length: p.shots }, (_, i) => ({
      /* Points at the files already in frontend/assets. storageKey stays null
         so deleting the row never deletes an original source photo. */
      url: `/assets/img/products/${p.cat}/${p.id}/${i + 1}.jpeg`,
      storageKey: null,
      altText: `${p.name} — ${p.colour}`,
      type: i === 0 ? ('MAIN' as const) : ('GALLERY' as const),
      isPrimary: i === 0,
      displayOrder: i,
    }));

    await prisma.product.create({
      data: {
        productName: p.name,
        slug,
        sku: p.sku,
        categoryId,
        status,
        featured: false,
        displayOrder: index,
        shortDescription: p.colour,
        construction: cat?.construction ?? null,
        material: cat?.material ?? null,
        usage: p.usage || cat?.usage || null,
        size: cat?.sizes ?? null,
        bladder: cat?.bladder ?? null,
        panelCount: p.note ?? cat?.panels ?? null,
        customizationAvailable: true,
        quoteOnly: true,
        priceLabel: 'Price on request',
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
        /* The reason a product arrived unpublished, kept where the admin will
           see it before deciding to publish. */
        customizationNotes: p.flag ? `Imported unpublished: ${p.flag}` : null,
        specifications: {
          create: specs.map(([label, value], i) => ({ label, value, displayOrder: i })),
        },
        images: { create: images },
      },
    });
    created += 1;
  }

  console.log(`  products      ${created} created (${drafted} as drafts), ${skipped} already present or skipped`);
}

/* ------------------------------------------------------------------ run --- */

async function main(): Promise<void> {
  console.log('Seeding WIN WEARS…');

  const legacy = readLegacy();
  if (!legacy) console.log('  ! frontend/assets/js/data/products.js not found — categories only');

  await seedSettings();
  const categoryIds = await seedCategories(legacy);
  if (legacy) await seedProducts(legacy, categoryIds);

  const admins = await prisma.user.count();
  if (admins === 0) {
    console.log('\n  No admin account yet. Create one with:');
    console.log('    npm run create-admin\n');
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
