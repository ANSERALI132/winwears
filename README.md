# WIN WEARS

Premium football manufacturing website — a 15-page static frontend for a B2B
football manufacturer. Match, training and TPU ranges, custom branding,
private-label production, and a WhatsApp-first conversion path.

---

## Running it

The site has **no build step and no dependencies**. Two ways to view it:

**Open it directly** — double-click `frontend/index.html`.
Everything works except one thing: the product detail template reads a query
string (`product.html?id=hyb-09`), which some browsers restrict on `file://`.

**Serve it locally** (recommended, needs nothing installed):

```bash
powershell -ExecutionPolicy Bypass -File "tools/serve.ps1" -Port 8099
```

Then open <http://localhost:8099/>. Stop it with Ctrl+C.

## Deploying

Upload the **contents of `frontend/`** to any static host — Netlify, Vercel,
Cloudflare Pages, GitHub Pages, or ordinary cPanel hosting. There is nothing to
compile and no server to run.

Netlify/Vercel/Cloudflare strip the `.html` automatically, so
`/products/tpu-ball.html` is served at the clean URL `/products/tpu-ball`.

Before going live, replace `https://winwears.com` with the real domain in
`frontend/sitemap.xml`, `frontend/robots.txt` and the `<link rel="canonical">`
tag at the top of each page.

---

## Structure

```
frontend/                         ← this folder is the web root
├── index.html                    Home
├── products.html                 Full collection + filters
├── product.html                  Product detail template (?id=…)
├── customization.html            6-step ball configurator
├── manufacturing.html            Factory / process story
├── technology.html               Quality & technology
├── about.html   contact.html     Company pages
├── request-quote.html            B2B RFQ form
├── faq.html     404.html
├── products/                     The four category landing pages
├── sitemap.xml  robots.txt
└── assets/
    ├── css/  tokens · base · components · modules
    ├── js/   site · catalog · product · customizer · quote · ball3d · home
    │         └── data/products.js   ← the whole catalogue lives here
    └── img/  logo · factory · products/<category>/<id>/1.jpeg …

tools/
├── serve.ps1            Local preview server
├── organize-assets.sh   Copies source photos into assets/img (re-runnable)
├── build-chrome.sh      Keeps nav + footer identical across all 15 pages
└── partials/            The nav and footer, extracted

Catagories/  LOGO/  OUR FACTORY/   ← your original source files, untouched
```

---

## Editing content

### Products, categories and contact details

Everything is in **`frontend/assets/js/data/products.js`**. That single file
drives the collection page, the four category pages, the product detail
template, the quote form dropdowns and the WhatsApp messages.

To rename a product, edit its `name` and `colour`. To publish or unpublish one,
change its `status`.

### Adding a new product

1. Put its photos in `frontend/assets/img/products/<category>/<id>/` named
   `1.jpeg`, `2.jpeg`, …
2. Add a row to `WW.PRODUCTS` with a matching `id` and the number of `shots`.

### Navigation and footer

They are real HTML in every page, so you can edit any page directly. To change
them everywhere at once, edit `tools/partials/nav.html` or `footer.html` then:

```bash
bash tools/build-chrome.sh apply
```

Pages inside `products/` automatically get their `../` paths rewritten.

### Design system

All colours, type sizes, spacing, radii and animation timings are CSS custom
properties in `frontend/assets/css/tokens.css`. Change a value there and it
propagates across the whole site. The palette is derived from the WIN WEARS
badge — navy `#16264F`, crimson `#E1132C`.

---

## Connecting a backend

The quote form is deliberately frontend-only. There is exactly one place to
wire it up: the `ENDPOINT` constant at the top of
**`frontend/assets/js/quote.js`**.

Set it to your handler URL and the form POSTs `multipart/form-data` with every
field plus the uploaded logo and design files. Until then, submitting prepares
the enquiry and hands it to WhatsApp or email so no lead is lost.

**Whatever you connect must validate and sanitise every field server-side.**
The checks in `quote.js` are for user experience only and can be bypassed.

The same file is the natural integration point for Shopify, a headless CMS or a
quote-management system. Replacing `data/products.js` with a `fetch` that
assigns the same shapes to `window.WW` is all the catalogue needs to move to an
API.

---

## Two things to review before you publish

**1 · Third-party trademarks in the product photos.**
Of the 54 product folders supplied, **20 show other companies' branding** —
Nike (one with an FC Barcelona crest), adidas (UEFA Champions League and EURO
2024 balls), Molten, Mikasa, Derbystar/Bundesliga, Voit, Puma and a Stevenage
F.C. crest — or carry **FIFA Quality Pro** certification marks.

Those 20 are in `products.js` with `status: 'hidden'` and a `flag` explaining
why, so the site never renders them. The other 34 are live. If you hold
licensing for any of them, change `status` to `'public'` to publish it.

A handful of published models are marked with a `review` note where the panel
graphic closely resembles a well-known competition ball. No trademark is
visible on those, so they are published — but they are worth a look.

**2 · No certification is claimed anywhere.**
The site says we run our own inspection (sphericity, circumference, weight, air
retention, seam integrity, print registration) and explicitly does *not* claim
FIFA or federation certification. The FAQ says the same. If WIN WEARS does hold
a certification, add it — but add it as fact, with the certificate reference.

Nothing else on the site invents statistics, awards or delivery times. The one
editable placeholder is **"10+ years manufacturing experience"** on the
homepage; change or remove it in `frontend/index.html` if it is not accurate.

---

## What is built in

- **3D football** — a real truncated icosahedron built as 32 individual panels
  (12 pentagons, 20 hexagons), each one domed and rolled down at its edge so the
  seams are genuine grooves in the geometry, not lines painted on a sphere. Adds
  a pebbled grain bump map, a generated studio environment for the PU sheen, and
  the WIN WEARS wordmark curving across one hexagon. No model or texture file is
  downloaded — it is all generated at runtime, so there is nothing to license.
  Used on the homepage hero, the technology page, and the customiser preview
  where it recolours live as you pick swatches.
- **Motion** — cinematic hero, scroll reveals, magnetic buttons, cursor
  follower, parallax factory band, animated counters, page-scroll progress.
  All of it respects `prefers-reduced-motion`, and the 3D degrades on
  low-memory, low-core and small-screen devices before disabling entirely
  without WebGL.
- **WhatsApp system** — a floating CTA on every page, plus context-aware
  messages: product pages pre-fill the model name and SKU, the customiser
  pre-fills the whole specification.
- **Accessibility** — semantic landmarks, one `h1` per page, skip link, visible
  focus states, keyboard-operable accordions and menu, focus trapping in the
  mobile menu, alt text on every image.
- **Performance** — no framework, no bundler, lazy-loaded images, three.js
  loaded only when a 3D surface is actually on the page, render loop paused when
  off-screen or the tab is hidden.

Verified across 360 / 414 / 768 / 1024 / 1440 / 1920px with no horizontal
overflow, no broken links and no missing assets on any of the 15 pages.
