import { z } from 'zod';
import { boolish, email, honeypot, optionalLongText, optionalText, pagination, phone, requiredText } from './common';

export const quoteStatus = z.enum(['NEW', 'CONTACTED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED']);
export const messageStatus = z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED']);

/** What the public RFQ form may send. Note there is no `status` and no
 *  `internalNotes` here — those are admin-only and cannot be set from
 *  outside, however the request is shaped. */
export const quoteCreateSchema = z.object({
  name: requiredText('Your name', 120),
  company: optionalText(160),
  country: optionalText(80),
  email,
  whatsapp: phone,
  productId: optionalText(64),
  category: optionalText(120),
  quantity: z.coerce.number().int().min(1).max(10_000_000).optional(),
  size: optionalText(64),
  customizationRequired: boolish.default(false),
  message: optionalLongText(5000),
  website: honeypot,
});

export const quoteUpdateSchema = z
  .object({
    status: quoteStatus.optional(),
    internalNotes: optionalLongText(10_000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export const quoteListQuery = pagination.extend({
  q: optionalText(120),
  status: quoteStatus.optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const contactCreateSchema = z.object({
  name: requiredText('Your name', 120),
  email,
  company: optionalText(160),
  whatsapp: phone,
  subject: optionalText(200),
  message: requiredText('Message', 5000),
  website: honeypot,
});

export const contactUpdateSchema = z
  .object({ status: messageStatus })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export const contactListQuery = pagination.extend({
  q: optionalText(120),
  status: messageStatus.optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});
