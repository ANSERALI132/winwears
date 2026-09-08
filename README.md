# WIN WEARS

Premium football manufacturing website for a B2B manufacturer — match,
training and TPU ranges, custom branding, private-label production, and a
WhatsApp-first conversion path.

Two halves:

- **`frontend/`** — 15 hand-built pages. No framework, no bundler, no build step.
- **`backend/`** — REST API, PostgreSQL data layer, and a private admin
  dashboard at `/admin` where the whole catalogue is managed.

Adding a football is a form in the admin dashboard, not a code change.

---

## Running it

### Requirements

Node.js 20+ and a PostgreSQL database (local, or a free one from Neon or
Supabase). Neither is installed on this machine yet — get Node from
<https://nodejs.org> and a database from <https://neon.tech> if you do not
want to install PostgreSQL locally.

### First run

```bash
cd backend
npm install
cp ../.env.example ../.env
```

Fill in `DATABASE_URL` and `AUTH_SECRET` in `.env`, then:

```bash
npm run migrate:dev
npm run seed
```

Create your admin account — there is no default one:

```bash
# PowerShell
$env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a long passphrase"; npm run create-admin
```

Start it:

```bash
npm run dev
```

| | |
|---|---|
| Website | <http://localhost:3000/> |
| Admin | <http://localhost:3000/admin> |

Full backend documentation, every API route and the security notes are in
[`backend/README.md`](backend/README.md).

### Viewing the frontend alone

The pages still render without the backend, but the catalogue, contact details
and forms will show their error states — the data lives in the database now.

```bash
powershell -ExecutionPolicy Bypass -File "tools/serve.ps1" -Port 8099
```

---

## Structure

```
frontend/                         ← the public website
├── index.html                    Home
├── products.html                 Full collection + filters
├── product.html                  Product detail template (?slug=…)
├── customization.html            6-step ball configurator
├── manufacturing.html            Factory / process story
├── technology.html               Quality & technology
├── about.html   contact.html     Company pages (contact has the message form)
├── request-quote.html            B2B RFQ form
├── faq.html     404.html
├── products/                     The four category landing pages
├── sitemap.xml  robots.txt
└── assets/
    ├── css/  tokens · base · components · modules
    ├── js/   api · site · catalog · product · customizer · quote · contact
    │         · ball3d · home
    │         └── data/products.js   ← legacy; read only by the seed script
    └── img/  logo · factory · products/<category>/<id>/1.jpeg …

backend/                          ← API, database, admin dashboard
├── prisma/     schema · migrations · seed · create-admin
├── src/
│   ├── api/        public routes, auth, and admin/
│   ├── lib/        storage · slugs · settings · serialisation · audit · …
│   ├── middleware/ auth · CSRF · error boundary · uploads
│   ├── validation/ Zod schemas
│   └── admin/public/   the dashboard itself
└── uploads/    local storage driver's files (git-ignored)

tools/
├── serve.ps1            Static preview of frontend/ alone
├── organize-assets.sh   Copies source photos into assets/img (re-runnable)
├── build-chrome.sh      Keeps nav + footer identical across all 15 pages
└── partials/            The nav and footer, extracted

Catagories/  LOGO/  OUR FACTORY/   ← your original source files, untouched
```

---

## Managing content

### Products

Sign in at `/admin`, then **Products → Add Product**. Eight steps: basics,
technical values, features, specifications, images, commercial terms, SEO, and
publish. Nothing about a product is hard-coded — the construction, material,
bladder, panel count and every specification row are yours to type, and there
is no limit on how many products you create.

Each row in the products table can also be edited, duplicated, published,
unpublished or deleted. Deleting archives the product so it can be restored;
only an administrator can delete one permanently.

Ticking **Featured** puts a product on the homepage. The number shown there is
a setting (`homepage.featuredLimit`), so the strip never overcrowds.

### Categories

**Categories** in the admin. Add, edit, reorder, activate or deactivate. A
category holding products cannot be deleted — move them first, or just
deactivate it.

The four category landing pages under `frontend/products/` are static and each
one names its category by slug in `data-category`. A new category appears
everywhere else automatically; giving it its own landing page means copying one
of those four files.

### Contact details and social links

**Settings** in the admin. Company name, email, WhatsApp number, the three
social URLs, footer text and default SEO all live in the database, and the
website reads them from `/api/settings` on every page load.

### Bulk changes

**Products → Import / Export**. Export everything as CSV, or import a file
built from the downloadable template. Import validates every row first and
writes nothing unless the whole file is clean; existing SKUs are never
overwritten silently.

### Enquiries

Quote requests and contact messages go into the database and appear under
**Quote Requests** and **Contact Messages**, with status tracking and internal
notes. The RFQ form still falls back to the WhatsApp and email handoff if the
request fails, so a lead is never lost to a server hiccup.

### Design system

All colours, type sizes, spacing, radii and animation timings are CSS custom
properties in `frontend/assets/css/tokens.css`. Change a value there and it
propagates across the site. The palette comes from the WIN WEARS badge — navy
`#16264F`, crimson `#E1132C`.

### Navigation and footer

Real HTML in every page. To change them everywhere at once, edit
`tools/partials/nav.html` or `footer.html`, then:

```bash
bash tools/build-chrome.sh apply
```

---

## Deploying

The backend needs a Node host (Railway, Render, Fly, a VPS) and a PostgreSQL
database:

```bash
cd backend
npm ci
npm run build
npm run migrate:deploy
NODE_ENV=production npm start
```

Set `TRUST_PROXY=true` only when a reverse proxy really is in front of the
process. `NODE_ENV=production` turns on the `Secure` cookie flag, so the admin
dashboard needs HTTPS.

`frontend/` can be served by the same process (`SERVE_FRONTEND=true`) or put on
a CDN with `/api` and `/admin` proxied to the backend.

Before going live, replace `https://winwears.com` with the real domain in
`frontend/sitemap.xml`, `frontend/robots.txt`, the `<link rel="canonical">` tag
on each page, and the `seo.siteUrl` setting in the admin.

---

## Two things to review before you publish

**1 · Third-party trademarks in the product photos.**
Of the 54 product folders supplied, **20 show other companies' branding** —
Nike (one with an FC Barcelona crest), adidas (UEFA Champions League and EURO
2024 balls), Molten, Mikasa, Derbystar/Bundesliga, Voit, Puma and a Stevenage
F.C. crest — or carry **FIFA Quality Pro** certification marks.

The seed imports all 54, but those 20 arrive as **drafts** with the reason
recorded on each one, so the website never renders them. The other 34 are
published. If you hold licensing for any of the 20, open it in the admin and
publish it.

**2 · No certification is claimed anywhere.**
The site says we run our own inspection (sphericity, circumference, weight, air
retention, seam integrity, print registration) and explicitly does *not* claim
FIFA or federation certification. The FAQ says the same. If WIN WEARS does hold
a certification, add it — but add it as fact, with the certificate reference.

Nothing on the site invents statistics, awards or delivery times. The one
editable placeholder is **"10+ years manufacturing experience"** on the
homepage; change or remove it in `frontend/index.html` if it is not accurate.

---

## What is built in

### Website

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
- **Loading, empty and error states** — the catalogue arrives over the network,
  so grids show skeletons while they load and a real message with a retry if a
  request fails.
- **Accessibility** — semantic landmarks, one `h1` per page, skip link, visible
  focus states, keyboard-operable accordions and menu, focus trapping in the
  mobile menu, alt text on every image.
- **Performance** — no framework, no bundler, server-side filtering and
  pagination, lazy-loaded images, three.js loaded only when a 3D surface is
  actually on the page, render loop paused when off-screen or the tab is hidden.

### Backend

- **PostgreSQL + Prisma** — fifteen models, indexed on every field the site
  filters or sorts by.
- **Admin dashboard** — products, categories, features, specifications, a
  drag-and-drop image gallery, quotes, messages, settings, users and an
  activity log. Works down to a phone.
- **Security** — sessions stored in the database so access can be revoked
  instantly, bcrypt password hashing, role-based authorisation, CSRF
  double-submit tokens, Zod validation on every input, uploads checked by magic
  bytes rather than by their claimed type, rate limits on reads, forms and
  login, honeypots on the public forms, and an error boundary that never lets a
  database message reach a customer.
- **Storage abstraction** — local disk out of the box; Cloudinary, S3, Supabase
  Storage and Vercel Blob are one driver each, selected by an environment
  variable.

### AI customer support assistant

Optional, and off unless you give it a key. It answers from the database
rather than from what a model happens to believe: product facts come from the
catalogue, business facts from knowledge entries you write in the admin, and
anything it cannot find it declines to guess at, offering the WIN WEARS team
instead.

- Searches the real catalogue, recommends published products as cards, and
  never surfaces a draft.
- Collects a quote request conversationally and files it with a reference
  like `WW-RFQ-2026-0001`, marked as coming from the assistant.
- Hands over to WhatsApp with what the customer already said, so they do not
  repeat themselves.
- Escalates when it is out of its depth — and independently when a lead looks
  serious, without waiting for the model to notice.
- Admin screens for conversations, transcripts including tool calls, lead
  status, a knowledge base, and analytics.

**To switch it on:** set `AI_API_KEY` in `.env` to a key from
[console.anthropic.com](https://console.anthropic.com/settings/keys). With it
blank the site behaves exactly as it did before the assistant existed — no
launcher, no extra requests, no stylesheet fetched. See
[backend/README.md](backend/README.md) for the cost ceilings and how to write
knowledge entries.
