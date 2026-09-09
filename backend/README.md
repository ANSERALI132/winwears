# WIN WEARS — backend

REST API, admin dashboard and PostgreSQL data layer for the WIN WEARS website.

The public site in `../frontend` is unchanged HTML/CSS/JS. What changed is
where its data comes from: the catalogue now lives in PostgreSQL and is
managed from `/admin`, so adding a football never means editing a source file.

---

## Requirements

| | |
|---|---|
| Node.js | 20 or newer |
| PostgreSQL | 14 or newer — a local install, or a hosted database (Neon, Supabase, Railway) |

Check what you have:

```bash
node --version
```

Neither Node nor PostgreSQL is installed on this machine yet. Install Node from
<https://nodejs.org> (LTS), then either install PostgreSQL locally or create a
free database at <https://neon.tech> and copy its connection string.

---

## First run

```bash
cd backend
npm install
```

Then configure the environment. The template lives at the **project root**:

```bash
cp ../.env.example ../.env
```

Fill in two values before anything will start:

- `DATABASE_URL` — your PostgreSQL connection string
- `AUTH_SECRET` — 32+ random characters, which signs the session cookie

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Create the tables:

```bash
npm run migrate:dev
```

Load the four categories, the default settings, and the existing catalogue:

```bash
npm run seed
```

The seed reads `../frontend/assets/js/data/products.js` and migrates every
product across, pointing at the photographs already in `frontend/assets/img`.
The twenty products that file had marked hidden — their photographs carry a
third party's trademark or a certification mark — arrive as **drafts**, with
the reason recorded on each one. Nothing is published until you publish it.

Create your administrator account. There is no default account and no
password written anywhere:

```bash
# PowerShell
$env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a long passphrase"; npm run create-admin

# bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD="a long passphrase" npm run create-admin
```

Start it:

```bash
npm run dev
```

| | |
|---|---|
| Website | <http://localhost:3000/> |
| Admin | <http://localhost:3000/admin> |
| Health | <http://localhost:3000/api/health> |

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server, restarts on save |
| `npm run build` | Generates the Prisma client, compiles TypeScript, copies the admin assets |
| `npm start` | Runs the compiled server from `dist/` |
| `npm run migrate:dev` | Creates and applies a migration (development) |
| `npm run migrate:deploy` | Applies existing migrations (production) |
| `npm run seed` | Categories, settings and the catalogue migration |
| `npm run create-admin` | Creates or updates an administrator |
| `npm run studio` | Prisma Studio, a table browser |
| `npm run typecheck` | Type-checks without emitting |

## Production

```bash
npm ci
npm run build
npm run migrate:deploy
NODE_ENV=production npm start
```

Set `TRUST_PROXY=true` only when a reverse proxy really is in front of the
process — it makes Express trust `X-Forwarded-For`, which rate limiting relies
on, and trusting it without a proxy lets anyone forge their own IP.

`NODE_ENV=production` also turns on the `Secure` flag for the session cookie,
so the admin dashboard needs HTTPS in production.

### The AI assistant

The assistant is optional and off by default. With no `AI_API_KEY` the site
runs exactly as it did before it existed: the chat launcher never appears, the
"Ask AI About This Ball" button is not added, and the widget's stylesheet is
never even fetched. Nothing else on the site depends on it.

To turn it on, set `AI_API_KEY` to a key from
[console.anthropic.com](https://console.anthropic.com/settings/keys). The key
is read server-side only and must never reach the browser or a commit.

Every customer message is a paid API call, so five ceilings are enforced in
code rather than left to the model:

| Variable | Default | |
|---|---|---|
| `AI_MAX_TOKENS` | 1024 | Longest reply |
| `AI_MAX_TOOL_ITERATIONS` | 6 | Tool round-trips per question |
| `AI_MAX_MESSAGES_PER_CONVERSATION` | 40 | Messages before a chat closes |
| `AI_MAX_INPUT_CHARS` | 2000 | Longest single message |
| `RATE_LIMIT_AI_MAX` | 20 | Messages per visitor per window |

`AI_ENABLED=false` switches it off without removing the key.

The assistant answers only from what the database holds. Product facts come
from tool results; business facts come from published `AIKnowledge` entries,
managed at **/admin → AI Assistant → Knowledge**. An empty knowledge base is
not a failure state — the assistant will say the answer is not confirmed and
offer the WIN WEARS team, which is the intended behaviour when nobody has
written the answer down.

---

## Tests

```bash
npm start          # in one terminal — the tests talk to a running server
npm test           # in another
```

Three suites, run as separate processes so one crashing does not take the
others with it:

| | |
|---|---|
| `ai-tools.test.mjs` | The tools, against the real database — what the assistant can and cannot reach |
| `ai-api.test.mjs` | The HTTP surface, as a stranger and then as an admin |
| `ai-scenarios.test.mjs` | The §44 conversations and the hallucination cases |

No test framework: the runner is about eighty lines, and the project has one
build step and no bundler. The tests use the real database and the real
server on purpose — what is worth checking is that Prisma, Postgres, Express
and the tools agree with each other, which a mocked test cannot tell you.
Everything they create is deleted again, and the harness refuses to run at
all unless `DATABASE_URL` points at localhost.

**The scenario suite needs a real `AI_API_KEY`** and costs a few cents per
run. Without one it skips and says so, rather than passing quietly and
implying the model was checked. It is the only suite that exercises the
model's judgement — whether it searches before answering, whether it invents
a certification, whether a hostile knowledge entry can redirect it — as
opposed to the plumbing around it.

Running the whole suite twice inside fifteen minutes exhausts the AI rate
limit, which is shared with real visitors. Those checks then skip with a note
rather than failing; restart the server to reset the window.

---

## Layout

```
prisma/
  schema.prisma        Models, enums and indexes
  seed.ts              Categories, settings, catalogue migration
  create-admin.ts      Account bootstrap
src/
  server.ts            Entry point
  app.ts               Express wiring, security headers, sessions, static files
  env.ts               Environment parsed and validated at boot
  db.ts                Prisma client singleton
  lib/
    auth.ts            Password hashing, session shape
    sessionStore.ts    express-session store backed by the Session table
    storage.ts         Storage abstraction (local | cloudinary | s3 | …)
    fileType.ts        Upload sniffing by magic bytes
    productQuery.ts    Filter/sort builders shared by public and admin
    serialize.ts       Prisma rows -> JSON, one place, one policy
    settings.ts        Editable site settings and their defaults
    slug.ts            Slug generation and uniqueness
    audit.ts           Activity log writer
    rateLimit.ts       Three limiter tiers
    errors.ts          The error types the API may describe
  middleware/
    auth.ts            requireAuth, requireRole, CSRF
    error.ts           The single error-to-response boundary
    upload.ts          Multer instances for images and CSV
  validation/          Zod schemas per entity
  api/
    public.ts          Everything the website reads, plus the two forms
    auth.ts            Sign in / out / me / change password
    admin/             Admin-only routes, guarded once in index.ts
  admin/public/        The dashboard: HTML, CSS and browser JS
```

---

## API

Public — no authentication.

| Method | Path | |
|---|---|---|
| GET | `/api/settings` | Contact details and social links |
| GET | `/api/categories` | Active categories with product counts |
| GET | `/api/categories/:slug` | One category |
| GET | `/api/products` | Published products; filtered, sorted, paginated |
| GET | `/api/products/filters` | Filter values present in the catalogue |
| GET | `/api/products/featured` | Homepage selection |
| GET | `/api/products/:slug` | One product, plus related |
| POST | `/api/quotes` | RFQ, `multipart/form-data`, accepts a logo and a design file |
| POST | `/api/contact` | Contact message |
| GET | `/api/ai/status` | Whether the assistant is available, and its greeting |
| POST | `/api/ai/chat` | One message in, one reply plus product cards out |
| POST | `/api/ai/event` | Records a chat open, WhatsApp click or product view |

`/api/products` accepts `q`, `category`, `construction`, `material`, `usage`,
`size`, `customization`, `featured`, `sort`, `page`, `perPage`.

`/api/ai/chat` issues the session id itself and never accepts one it did not
generate: a conversation accumulates whatever contact details the customer
offers, so a guessable or caller-chosen id would let a stranger read someone
else's enquiry.

Authentication.

| Method | Path | |
|---|---|---|
| POST | `/api/auth/login` | Returns the user and a CSRF token |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | Current user, refreshed from the database |
| POST | `/api/auth/change-password` | |

Admin — session required; every mutation needs the `X-CSRF-Token` header.

| Method | Path | |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard counts |
| GET POST | `/api/admin/products` | List / create |
| GET PUT DELETE | `/api/admin/products/:id` | Read / update / soft-delete (`?hard=true` for a permanent delete, ADMIN only) |
| PATCH | `/api/admin/products/:id/status` | Publish, unpublish, archive |
| PATCH | `/api/admin/products/:id/featured` | |
| POST | `/api/admin/products/:id/duplicate` | Copies fields, features, specs and image references |
| POST | `/api/admin/products/:id/restore` | Undo a soft delete |
| POST | `/api/admin/products/reorder` | |
| PUT | `/api/admin/products/:id/features` | Replaces the set |
| PUT | `/api/admin/products/:id/specifications` | Replaces the set |
| GET POST | `/api/admin/products/:id/images` | List / upload |
| PATCH DELETE | `/api/admin/products/:id/images/:imageId` | Alt text, type, primary / delete |
| POST | `/api/admin/products/:id/images/reorder` | |
| GET POST | `/api/admin/categories` | |
| GET PUT DELETE | `/api/admin/categories/:id` | |
| PATCH | `/api/admin/categories/:id/active` | |
| POST | `/api/admin/categories/reorder` | |
| GET | `/api/admin/quotes` · `/api/admin/quotes/:id` | |
| PUT DELETE | `/api/admin/quotes/:id` | Status and internal notes / delete (ADMIN) |
| GET | `/api/admin/messages` · `/api/admin/messages/:id` | |
| PUT DELETE | `/api/admin/messages/:id` | |
| GET PUT | `/api/admin/settings` | Write is ADMIN only |
| GET POST | `/api/admin/users` | ADMIN only |
| PUT DELETE | `/api/admin/users/:id` | ADMIN only |
| GET | `/api/admin/activity` | |
| GET | `/api/admin/portability/export` · `/template` | CSV |
| POST | `/api/admin/portability/import` | `?dryRun=true` validates without writing |
| GET | `/api/admin/ai/stats` | Assistant summary, including why it escalates |
| GET | `/api/admin/ai/analytics` | Funnel, daily messages, popular products (`?days=`) |
| GET | `/api/admin/ai/conversations` | Filter by status, score, country, escalation |
| GET | `/api/admin/ai/conversations/:id` | Transcript, tool calls included |
| PATCH | `/api/admin/ai/conversations/:id/status` | Lead status |
| DELETE | `/api/admin/ai/conversations/:id` | Erases the conversation and its messages |
| GET POST | `/api/admin/ai/knowledge` | List / create |
| GET PUT DELETE | `/api/admin/ai/knowledge/:id` | |
| GET | `/api/admin/ai/knowledge/categories` | Suggested groupings, plus any in use |

Responses are `{ data, meta? }` on success and `{ error: { code, message,
issues? } }` on failure.

---

## Security notes

- **Sessions in the database.** A disabled account or a changed password ends
  every session immediately. A stateless JWT could not be taken back.
- **The user is re-read on every request.** Demoting somebody takes effect on
  their next click, not when their session happens to expire.
- **CSRF.** `SameSite=Lax` blocks the cross-site form post; a double-submit
  token, compared with `timingSafeEqual`, is the second lock.
- **Uploads are sniffed, not trusted.** The declared MIME type and the file
  extension are both attacker-chosen. Only JPEG, PNG, WEBP and PDF magic bytes
  are accepted, and the sniffed type — never the uploaded one — is stored.
- **Errors never leak.** Only `ApiError` and Zod failures are described to a
  caller. Everything else is logged in full server-side and answered with
  "Something went wrong. Please try again." plus a short reference to match
  the log entry.
- **Login is uniform and slow to guess.** One message for a missing account and
  a wrong password, a hash computed either way so the timing does not differ,
  and a rate limit that skips successful attempts.
- **Rate limits** on reads, on the public forms, and tighter on login.
- **Honeypot** field on both public forms: filled means a bot, and the request
  is answered like a success and dropped.
- **No secrets in the frontend.** Everything sensitive is read from the
  environment, and the environment is validated at boot.

### The assistant, specifically

- **The model never composes a query.** It chooses a tool name and supplies
  arguments; the executor rejects any name not in its registry and validates
  every argument against a Zod schema before a query runs. There is no path
  from the model to arbitrary SQL.
- **It cannot see what the site hides.** Every catalogue tool goes through the
  same `publicOnly` helper the public site uses, so a draft or archived
  product cannot be recommended in a chat window that a visitor could not
  reach by browsing, and only `PUBLISHED` knowledge entries are retrieved.
- **Conversation ids are server-issued** and 256 bits of randomness. A
  conversation holds whatever contact details a customer offered, so a
  caller-chosen id would be a way to read someone else's enquiry.
- **Tool context is passed per call**, never held in a module variable: the
  tool loop awaits between calls, so two visitors' messages interleave in one
  process and shared state would let one conversation write into another's.
- **Tool output is data, not instruction.** The system prompt says so, because
  product copy and knowledge entries are admin-editable text arriving in the
  model's context.
- **Nothing internal reaches a customer.** The WhatsApp handoff carries only
  what they told us — no ids, no lead score. Admin responses strip session
  ids. Provider failures become one sentence and a WhatsApp button, with the
  diagnosis in the server log.

---

## Adding a storage provider

`src/lib/storage.ts` defines a two-method interface. Add the driver, set
`STORAGE_PROVIDER`, and no call site changes:

```ts
interface StorageDriver {
  put(input: { buffer: Buffer; filename: string; contentType: string; prefix?: string }): Promise<StoredFile>;
  remove(key: string): Promise<void>;
}
```

Each stub names the package to install and the call to make.
