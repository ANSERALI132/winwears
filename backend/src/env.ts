/**
 * Environment configuration.
 *
 * Parsed once, at boot, through Zod. A missing or malformed secret should stop
 * the process immediately rather than surface as a confusing runtime failure
 * halfway through a request.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/* The repository keeps one .env at the project root, one level above backend/. */
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config();

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    /* Signs the session cookie. Rotating it logs everybody out. */
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

    /* Where the public site is served from, for CORS and absolute URLs. */
    SITE_ORIGIN: z.string().url().default('http://localhost:3000'),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),

    STORAGE_PROVIDER: z.enum(['local', 'cloudinary', 's3', 'supabase', 'vercel-blob']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('uploads'),
    STORAGE_PUBLIC_PATH: z.string().default('/uploads'),
    /* Business documents — a customer's artwork, a signed purchase order —
       live apart from product photographs and are never served statically.
       They are read back only through an authenticated route, because an
       unguessable URL is not the same thing as a private one. */
    STORAGE_PRIVATE_DIR: z.string().default('uploads-private'),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(8),

    CLOUDINARY_URL: z.string().optional(),
    CLOUDINARY_FOLDER: z.string().default('win-wears'),

    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().optional(),

    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_BUCKET: z.string().optional(),

    BLOB_READ_WRITE_TOKEN: z.string().optional(),

    RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
    RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_FORM_MAX: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(8),
    RATE_LIMIT_AI_MAX: z.coerce.number().int().positive().default(20),

    /* --- ai support agent -------------------------------------------------
       Deliberately not required. A missing key must not stop the site from
       booting: the catalogue, the quote form and the admin all work without
       the agent, so an absent key degrades to "the assistant is unavailable,
       here is WhatsApp" rather than taking the whole process down. */
    AI_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    AI_PROVIDER: z.enum(['anthropic', 'openai', 'none']).default('anthropic'),
    AI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default('claude-sonnet-5'),

    /* Cost ceilings. Every customer message is a paid call, so each of these
       is a hard stop rather than a suggestion. */
    AI_MAX_TOKENS: z.coerce.number().int().positive().max(8192).default(1024),
    /* How many times one question may bounce through tools before the agent
       must answer with what it has. Guards against a tool loop billing
       forever on a single message. */
    AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().max(20).default(6),
    AI_MAX_MESSAGES_PER_CONVERSATION: z.coerce.number().int().positive().default(40),
    AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(2000),

    /* How often the automation rules sweep for situations that have become
       true with time — an order going past its date, stock falling below its
       level. Set to 0 to stop the sweep entirely and run rules by hand.
       Fifteen minutes is often enough that nothing sits unnoticed for long,
       and rare enough that it is not a load on the database. */
    AUTOMATION_SWEEP_MINUTES: z.coerce.number().int().min(0).max(1440).default(15),

    /* Sending notification email. Every field is optional and the whole
       channel stays off until SMTP_HOST is set, so an installation with no
       mail server works exactly as before. Nothing here is ever logged. */
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    /* True for implicit TLS on 465; false for 587, which upgrades with
       STARTTLS. Defaulted from the port rather than guessed at. */
    SMTP_SECURE: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    /* What the message is from. Falls back to SMTP_USER, since most providers
       refuse to send as an address the account does not own. */
    MAIL_FROM: z.string().optional(),
    /* An address that receives everything, on top of each person's own.
       A shared inbox somebody watches when nobody is signed in. */
    MAIL_TO: z.string().optional(),
    /* Where the admin lives, so a link in an email is clickable. A hash route
       on its own is meaningless outside the browser that is already there. */
    ADMIN_URL: z.string().default('http://localhost:3000/admin'),

    /* Notifications to the business's own WhatsApp, through Meta's Cloud API.
       Off until the token, the phone number id and a destination are all set.
       Note that this is the outbound channel — separate from the wa.me links
       the site shows customers, which only open a chat for a person to use. */
    WHATSAPP_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    /* Where notifications go. The business's own number, in full
       international form; punctuation is stripped. */
    WHATSAPP_TO: z.string().optional(),
    /* An approved template name. Without one, messages are plain text, which
       WhatsApp only delivers within 24 hours of the recipient's last message
       to the business number. */
    WHATSAPP_TEMPLATE: z.string().optional(),
    WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
    WHATSAPP_API_VERSION: z.string().default('v21.0'),
    /* Which kinds reach the phone. Empty means all of them. This is one
       shared number rather than one per person, so it is set here rather than
       under anybody's own preferences — and it is worth narrowing, because a
       phone that buzzes for every recorded payment is a phone somebody
       silences. Example: WHATSAPP_KINDS=AI_ESCALATED,QC_FAILED */
    WHATSAPP_KINDS: z.string().default(''),

    /* Serve the static site from this process too. Handy in development; in
       production a CDN or nginx usually does it instead. */
    SERVE_FRONTEND: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    FRONTEND_DIR: z.string().default('../frontend'),

    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((cfg, ctx) => {
    /* A driver that cannot reach its bucket is worse than no driver at all,
       so require its credentials up front instead of at first upload. */
    const need = (cond: boolean, field: string) => {
      if (!cond) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when STORAGE_PROVIDER is "${cfg.STORAGE_PROVIDER}"`,
        });
      }
    };
    if (cfg.STORAGE_PROVIDER === 'cloudinary') need(!!cfg.CLOUDINARY_URL, 'CLOUDINARY_URL');
    if (cfg.STORAGE_PROVIDER === 's3') {
      need(!!cfg.S3_REGION, 'S3_REGION');
      need(!!cfg.S3_BUCKET, 'S3_BUCKET');
      need(!!cfg.S3_ACCESS_KEY_ID, 'S3_ACCESS_KEY_ID');
      need(!!cfg.S3_SECRET_ACCESS_KEY, 'S3_SECRET_ACCESS_KEY');
    }
    if (cfg.STORAGE_PROVIDER === 'supabase') {
      need(!!cfg.SUPABASE_URL, 'SUPABASE_URL');
      need(!!cfg.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
      need(!!cfg.SUPABASE_BUCKET, 'SUPABASE_BUCKET');
    }
    if (cfg.STORAGE_PROVIDER === 'vercel-blob') need(!!cfg.BLOB_READ_WRITE_TOKEN, 'BLOB_READ_WRITE_TOKEN');
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  /* Names only. Printing the values here would put secrets in the log. */
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n\nSee .env.example.\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
