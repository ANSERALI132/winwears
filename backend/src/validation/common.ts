import { z } from 'zod';

/**
 * Trims, and turns "" into null.
 *
 * null, not undefined: on an update Prisma reads undefined as "leave this
 * column alone", so an admin clearing a field would silently keep the old
 * value. null is what actually empties it.
 */
export const optionalText = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length ? v : null))
    .nullish();

export const requiredText = (label: string, max = 300) =>
  z.string({ required_error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max);

export const optionalLongText = (max = 20_000) => optionalText(max);

export const email = z
  .string({ required_error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254);

/** Digits, spaces and the usual punctuation — deliberately permissive, since
 *  international numbers are written every possible way. */
export const phone = z
  .string()
  .trim()
  .max(32)
  .regex(/^[+()\d\s.-]*$/, 'Enter a valid phone number.')
  .transform((v) => (v.length ? v : null))
  .nullish();

export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', 'on', 'off', '1', '0'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === 'on' || v === '1'));

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
});

export const idParam = z.object({ id: z.string().min(1).max(64) });
export const slugParam = z.object({ slug: z.string().min(1).max(120) });

/**
 * Honeypot: a field real people never see and never fill.
 *
 * When it arrives populated the request is answered with a normal-looking
 * success and quietly dropped, so a bot gets no signal to adapt.
 */
export const honeypot = z.string().max(200).optional();
