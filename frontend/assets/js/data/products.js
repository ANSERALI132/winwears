/* ==========================================================================
   WIN WEARS — Catalogue snapshot  (FALLBACK ONLY — NOT THE SOURCE OF TRUTH)
   --------------------------------------------------------------------------
   The live catalogue lives in PostgreSQL and is managed at /admin. This file
   is the safety net, and it has exactly two jobs:

     1. backend/prisma/seed.ts reads it once, to migrate this catalogue into
        the database on a fresh install.
     2. assets/js/api.js loads it ONLY if the API cannot be reached at all —
        the backend is down, or the site is being served as static files with
        no backend behind it. The site then shows this catalogue instead of an
        error, and switches back to the database the moment the API answers.

   It assigns to window.WW_SNAPSHOT, deliberately not window.WW, so it can
   never overwrite the live data layer.

   Editing this file changes nothing on a running site. Edit products at
   /admin. Keep it in step by exporting from the admin if you want the
   fallback to stay current.
   ========================================================================== */

/* ==========================================================================
   WIN WEARS — Catalogue data
   --------------------------------------------------------------------------
   This is the ONLY file you need to edit to change products, contact details
   or category copy. It is a plain script (no build step, no fetch) so it works
   when the site is opened straight from disk as well as from a web server.

   To move to a CMS / API later, replace this file with a fetch that assigns
   the same shapes to window.WW_SNAPSHOT.

   PRODUCT FIELDS
     id      unique slug, also the image folder name
     sku     shown on the product page
     cat     category slug
     name    model designation  — rename freely
     colour  colourway          — rename freely
     shots   how many photos exist in assets/img/products/<cat>/<id>/
     usage   Match | Training | Promotional
     status  "public"  → listed on the site
             "hidden"  → kept here but never rendered (see `flag`)
     flag    why it is hidden. Set status to "public" to publish it.
   ========================================================================== */

window.WW_SNAPSHOT = window.WW_SNAPSHOT || {};

/* --- Business details ----------------------------------------------------- */
WW_SNAPSHOT.CONTACT = {
  brand: 'WIN WEARS',
  tagline: 'Premium Football Manufacturing',
  phoneDisplay: '+92 370 6495974',
  whatsapp: 'https://wa.me/923706495974',
  email: 'wwinwears@gmail.com',
  social: {
    facebook: 'https://www.facebook.com/share/1c6SBnGCqU/',
    instagram: 'https://www.instagram.com/winwe.ars?igsi=cm80MnpuNWJ0ZWdk',
    linkedin: 'https://www.linkedin.com/in/win-wears-085a31405?utm_source=share_via&utm_content=profile&utm_medium=member_android',
    whatsapp: 'https://wa.me/923706495974'
  }
};

/* --- Categories ----------------------------------------------------------- */
WW_SNAPSHOT.CATEGORIES = [
  {
    slug: 'hybrid-pro-match-ball',
    key: 'hybrid',
    num: '01',
    name: 'Hybrid Pro Match Ball',
    short: 'Hybrid Pro',
    page: 'products/hybrid-pro-match-ball.html',
    blurb: 'Machine precision paired with hand-finished detail. Our widest match range, built for clubs and academies that need consistency across large orders.',
    construction: 'Hybrid — machine bonded with hand-finished seams',
    material: 'PU outer',
    bladder: 'Butyl or latex — specified at order',
    panels: 'Panel count varies by model',
    sizes: '3, 4, 5',
    usage: 'Match'
  },
  {
    slug: 'hand-made-match-ball',
    key: 'handmade',
    num: '02',
    name: 'Hand Made Match Ball',
    short: 'Hand Made',
    page: 'products/hand-made-match-ball.html',
    blurb: 'Hand-stitched by specialist stitchers, panel by panel. The traditional construction, still preferred where seam strength and shape retention matter most.',
    construction: 'Hand stitched',
    material: 'PU outer',
    bladder: 'Butyl or latex — specified at order',
    panels: '32 panel standard',
    sizes: '3, 4, 5',
    usage: 'Match'
  },
  {
    slug: 'thermal-bonded-match-ball',
    key: 'thermal',
    num: '03',
    name: 'Thermal Bonded Match Ball',
    short: 'Thermal Bonded',
    page: 'products/thermal-bonded-match-ball.html',
    blurb: 'Seamless thermally bonded construction. No stitch channels, a more uniform surface and reduced water uptake for professional-level play.',
    construction: 'Thermal bonded — seamless',
    material: 'PU outer',
    bladder: 'Butyl or latex — specified at order',
    panels: 'Low-panel and 20-panel layouts',
    sizes: '4, 5',
    usage: 'Match'
  },
  {
    slug: 'tpu-ball',
    key: 'tpu',
    num: '04',
    name: 'TPU Ball',
    short: 'TPU',
    page: 'products/tpu-ball.html',
    blurb: 'Hard-wearing TPU footballs for training volume, academy sessions, promotional runs and event giveaways — the range that takes the most abuse.',
    construction: 'Machine stitched / bonded TPU',
    material: 'TPU outer',
    bladder: 'Butyl or rubber — specified at order',
    panels: '32 panel standard',
    sizes: '3, 4, 5',
    usage: 'Training'
  }
];

/* --- Products ------------------------------------------------------------- */
/* eslint-disable */
WW_SNAPSHOT.PRODUCTS = [
  /* ---------- 01 · HYBRID PRO MATCH BALL ---------- */
  { id:'hyb-01', sku:'WW-HYB-01', cat:'hybrid', name:'Hybrid Pro', colour:'White · Red · Black', shots:4, usage:'Match', status:'public' },
  { id:'hyb-02', sku:'WW-HYB-02', cat:'hybrid', name:'Hybrid Pro', colour:'Volt · Black · Silver', shots:3, usage:'Match', status:'public' },
  { id:'hyb-03', sku:'WW-HYB-03', cat:'hybrid', name:'Hybrid Pro', colour:'White · Royal Blue', shots:3, usage:'Match', status:'public' },
  { id:'hyb-04', sku:'WW-HYB-04', cat:'hybrid', name:'Hybrid Pro', colour:'White · Green · Black', shots:4, usage:'Match', status:'public' },
  { id:'hyb-05', sku:'WW-HYB-05', cat:'hybrid', name:'Hybrid Pro', colour:'White · Sky Blue', shots:6, usage:'Match',
    status:'hidden', flag:'Photo shows a FIFA Quality Pro certification mark. Publishing it asserts FIFA certification — re-enable only if WIN WEARS holds that certification for this model.' },
  { id:'hyb-06', sku:'WW-HYB-06', cat:'hybrid', name:'Hybrid Pro', colour:'White · Bronze · Black', shots:4, usage:'Match', status:'public',
    review:'Star-panel layout closely resembles a well-known competition ball design.' },
  { id:'hyb-07', sku:'WW-HYB-07', cat:'hybrid', name:'Hybrid Pro', colour:'White · Blue · Black', shots:4, usage:'Match', status:'public' },
  { id:'hyb-08', sku:'WW-HYB-08', cat:'hybrid', name:'Hybrid Pro', colour:'White · Violet · Black', shots:4, usage:'Match', status:'public' },
  { id:'hyb-09', sku:'WW-HYB-09', cat:'hybrid', name:'Hybrid Pro', colour:'Blue · Red · White', shots:7, usage:'Match', status:'public' },
  { id:'hyb-10', sku:'WW-HYB-10', cat:'hybrid', name:'Hybrid Pro', colour:'White · Orange · Sky', shots:6, usage:'Match', status:'public' },
  { id:'hyb-11', sku:'WW-HYB-11', cat:'hybrid', name:'Hybrid Pro', colour:'White · Red · Cyan', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows a FIFA Quality Pro certification mark.' },
  { id:'hyb-12', sku:'WW-HYB-12', cat:'hybrid', name:'Hybrid Pro', colour:'White · Royal · Black', shots:4, usage:'Match', status:'public' },
  { id:'hyb-13', sku:'WW-HYB-13', cat:'hybrid', name:'Hybrid Pro', colour:'White · Volt · Blue', shots:6, usage:'Match', status:'public' },
  { id:'hyb-14', sku:'WW-HYB-14', cat:'hybrid', name:'Hybrid Pro', colour:'Pink · Teal', shots:4, usage:'Match', status:'public' },
  { id:'hyb-15', sku:'WW-HYB-15', cat:'hybrid', name:'Hybrid Pro', colour:'Black · Gold', shots:5, usage:'Match', status:'public' },
  { id:'hyb-16', sku:'WW-HYB-16', cat:'hybrid', name:'Hybrid Pro', colour:'Yellow · Cyan · Navy', shots:3, usage:'Match', status:'public' },
  { id:'hyb-17', sku:'WW-HYB-17', cat:'hybrid', name:'Hybrid Pro', colour:'White · Cyan · Blue', shots:3, usage:'Match', status:'public' },
  { id:'hyb-18', sku:'WW-HYB-18', cat:'hybrid', name:'Hybrid Pro', colour:'White · Blue · Black', shots:4, usage:'Match', status:'public' },
  { id:'hyb-19', sku:'WW-HYB-19', cat:'hybrid', name:'Hybrid Pro', colour:'Volt · Black', shots:5, usage:'Match', status:'public' },
  { id:'hyb-20', sku:'WW-HYB-20', cat:'hybrid', name:'Hybrid Pro', colour:'White · Grey · Red', shots:6, usage:'Training', status:'public',
    review:'A small third-party wordmark may be visible on some shots — check before publishing.' },
  { id:'hyb-21', sku:'WW-HYB-21', cat:'hybrid', name:'Hybrid Pro', colour:'White · Blue · Yellow', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the PUMA trademark.' },
  { id:'hyb-22', sku:'WW-HYB-22', cat:'hybrid', name:'Hybrid Pro', colour:'White · Multicolour', shots:5, usage:'Match', status:'public',
    review:'Graphic closely resembles a 2022 World Cup match ball design.' },
  { id:'hyb-23', sku:'WW-HYB-23', cat:'hybrid', name:'Hybrid Pro', colour:'White · Red · Black', shots:3, usage:'Match', status:'public' },
  { id:'hyb-24', sku:'WW-HYB-24', cat:'hybrid', name:'Hybrid Pro', colour:'White · Yellow · Green', shots:5, usage:'Match', status:'public' },
  { id:'hyb-25', sku:'WW-HYB-25', cat:'hybrid', name:'Hybrid Pro', colour:'White · Blue · Yellow', shots:4, usage:'Match', status:'public' },

  /* ---------- 02 · HAND MADE MATCH BALL ---------- */
  { id:'hm-01', sku:'WW-HM-01', cat:'handmade', name:'Hand Made', colour:'White · Red · Blue', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows a FIFA Quality Pro certification mark.' },
  { id:'hm-02', sku:'WW-HM-02', cat:'handmade', name:'Hand Made', colour:'White · Multicolour', shots:3, usage:'Match', status:'public' },
  { id:'hm-03', sku:'WW-HM-03', cat:'handmade', name:'Hand Made', colour:'White · Gold · Black', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the MIKASA trademark and a FIFA Quality mark.' },
  { id:'hm-04', sku:'WW-HM-04', cat:'handmade', name:'Hand Made', colour:'Yellow · Red · Black', shots:4, usage:'Match', status:'public' },
  { id:'hm-05', sku:'WW-HM-05', cat:'handmade', name:'Hand Made', colour:'White · Navy · Green', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the Voit trademark and a league identity.' },
  { id:'hm-06', sku:'WW-HM-06', cat:'handmade', name:'Hand Made', colour:'White · Orange', shots:3, usage:'Match',
    status:'hidden', flag:'Photo shows the Molten trademark and the AFC logo.' },
  { id:'hm-07', sku:'WW-HM-07', cat:'handmade', name:'Hand Made', colour:'White · Yellow · Black', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the Molten trademark and a FIFA Quality Pro mark.' },
  { id:'hm-08', sku:'WW-HM-08', cat:'handmade', name:'Hand Made', colour:'White · Magenta · Teal', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the Derbystar, Select and Bundesliga trademarks.' },
  { id:'hm-09', sku:'WW-HM-09', cat:'handmade', name:'Hand Made', colour:'Yellow · Orange · Black', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the adidas trademark and a FIFA Quality Pro mark.' },
  { id:'hm-10', sku:'WW-HM-10', cat:'handmade', name:'Hand Made', colour:'White · Blue · Green', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the Molten trademark and the AFC logo.' },
  { id:'hm-11', sku:'WW-HM-11', cat:'handmade', name:'Hand Made', colour:'White · Orange · Blue', shots:3, usage:'Match', status:'public' },
  { id:'hm-12', sku:'WW-HM-12', cat:'handmade', name:'Hand Made', colour:'Claret · Blue', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the Nike trademark and the FC Barcelona crest.' },

  /* ---------- 03 · THERMAL BONDED MATCH BALL ---------- */
  { id:'tb-01', sku:'WW-TB-01', cat:'thermal', name:'Thermal Bonded', colour:'White · Blue', shots:4, usage:'Match', status:'public', note:'20-panel layout' },
  { id:'tb-02', sku:'WW-TB-02', cat:'thermal', name:'Thermal Bonded', colour:'White · Teal · Gold', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the adidas trademark and UEFA Champions League identity.' },
  { id:'tb-03', sku:'WW-TB-03', cat:'thermal', name:'Thermal Bonded', colour:'White · Red · Black', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the Stevenage F.C. club crest.' },
  { id:'tb-04', sku:'WW-TB-04', cat:'thermal', name:'Thermal Bonded', colour:'White · Red · Black', shots:4, usage:'Match', status:'public' },
  { id:'tb-05', sku:'WW-TB-05', cat:'thermal', name:'Thermal Bonded', colour:'White · Red', shots:3, usage:'Match', status:'public' },
  { id:'tb-06', sku:'WW-TB-06', cat:'thermal', name:'Thermal Bonded', colour:'White · Green · Black', shots:3, usage:'Match', status:'public' },
  { id:'tb-07', sku:'WW-TB-07', cat:'thermal', name:'Thermal Bonded', colour:'White · Multicolour', shots:4, usage:'Match',
    status:'hidden', flag:'Photo shows the adidas trademark and UEFA EURO 2024 identity.' },
  { id:'tb-08', sku:'WW-TB-08', cat:'thermal', name:'Thermal Bonded', colour:'White · Magenta · Volt', shots:5, usage:'Match', status:'public' },

  /* ---------- 04 · TPU BALL ---------- */
  { id:'tpu-01', sku:'WW-TPU-01', cat:'tpu', name:'TPU Training', colour:'White · Volt · Black', shots:4, usage:'Training', status:'public' },
  { id:'tpu-02', sku:'WW-TPU-02', cat:'tpu', name:'TPU Training', colour:'White · Navy · Red', shots:4, usage:'Training', status:'public' },
  { id:'tpu-03', sku:'WW-TPU-03', cat:'tpu', name:'TPU Training', colour:'White · Blue', shots:4, usage:'Training', status:'public',
    review:'Graphic resembles a 2022 World Cup ball design.' },
  { id:'tpu-04', sku:'WW-TPU-04', cat:'tpu', name:'TPU Training', colour:'White · Red · Blue', shots:3, usage:'Training', status:'public',
    review:'Panel graphic resembles a well-known brand ball layout.' },
  { id:'tpu-05', sku:'WW-TPU-05', cat:'tpu', name:'TPU Training', colour:'Orange · Blue', shots:4, usage:'Training',
    status:'hidden', flag:'Photo shows the Nike trademark.' },
  { id:'tpu-06', sku:'WW-TPU-06', cat:'tpu', name:'TPU Training', colour:'Volt · Cyan', shots:3, usage:'Training',
    status:'hidden', flag:'Photo shows a Nike Total 90 identity.' },
  { id:'tpu-07', sku:'WW-TPU-07', cat:'tpu', name:'TPU Training', colour:'Volt · Pink · Blue', shots:2, usage:'Training',
    status:'hidden', flag:'Photo shows the Nike trademark.' },
  { id:'tpu-08', sku:'WW-TPU-08', cat:'tpu', name:'TPU Training', colour:'White · Red · Black', shots:3, usage:'Training',
    status:'hidden', flag:'Photo shows an adidas EURO 2024 match ball replica identity.' },
  { id:'tpu-09', sku:'WW-TPU-09', cat:'tpu', name:'TPU Training', colour:'Violet · Orange', shots:3, usage:'Training',
    status:'hidden', flag:'Photo shows the adidas trademark and UEFA EURO 2024 identity.' }
];

/* --- Helpers -------------------------------------------------------------- */
WW_SNAPSHOT.catBy = function (key) {
  for (var i = 0; i < WW_SNAPSHOT.CATEGORIES.length; i++) {
    if (WW_SNAPSHOT.CATEGORIES[i].key === key || WW_SNAPSHOT.CATEGORIES[i].slug === key) return WW_SNAPSHOT.CATEGORIES[i];
  }
  return null;
};

/** Products that are safe to render. */
WW_SNAPSHOT.publicProducts = function (catKey) {
  return WW_SNAPSHOT.PRODUCTS.filter(function (p) {
    return p.status === 'public' && (!catKey || p.cat === catKey);
  });
};

WW_SNAPSHOT.productBy = function (id) {
  for (var i = 0; i < WW_SNAPSHOT.PRODUCTS.length; i++) if (WW_SNAPSHOT.PRODUCTS[i].id === id) return WW_SNAPSHOT.PRODUCTS[i];
  return null;
};

/** Image paths for a product, relative to the site root. */
WW_SNAPSHOT.images = function (p) {
  var out = [];
  for (var i = 1; i <= p.shots; i++) out.push('assets/img/products/' + p.cat + '/' + p.id + '/' + i + '.jpeg');
  return out;
};

/** Indicative spec sheet. Values come from the category and stay editable. */
WW_SNAPSHOT.specs = function (p) {
  var c = WW_SNAPSHOT.catBy(p.cat) || {};
  return [
    ['Category', c.name || ''],
    ['Construction', c.construction || ''],
    ['Outer material', c.material || ''],
    ['Bladder', c.bladder || ''],
    ['Panels', p.note || c.panels || ''],
    ['Sizes', c.sizes || ''],
    ['Weight', 'To size standard — confirmed at order'],
    ['Intended use', p.usage || c.usage || ''],
    ['Customisation', 'Available — colours, artwork, logo and packaging']
  ];
};
