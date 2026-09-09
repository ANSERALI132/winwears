import { z } from 'zod';
import { optionalText, pagination, requiredText } from './common';

export const companySegment = z.enum([
  'DISTRIBUTOR', 'CLUB', 'ACADEMY', 'SPORTS_BRAND',
  'WHOLESALER', 'TOURNAMENT_ORGANIZER', 'RETAILER', 'OTHER',
]);

export const leadSource = z.enum([
  'WEBSITE_FORM', 'AI_ASSISTANT', 'WHATSAPP', 'EMAIL',
  'REFERRAL', 'TRADE_SHOW', 'MANUAL', 'OTHER',
]);

export const leadStage = z.enum([
  'NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY', 'RFQ',
  'QUOTATION', 'NEGOTIATION', 'SAMPLE', 'WON', 'LOST',
]);

export const leadScore = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

/** Free-form, but bounded and normalised: tags are for filtering, and
 *  "Hot Lead", "hot lead" and "HOT_LEAD" being three different tags makes
 *  the filter useless. */
const tags = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((list) => [...new Set(list.map((t) => t.toUpperCase().replace(/\s+/g, '_')))]);

export const companyCreateSchema = z.object({
  name: requiredText('A company name', 200),
  country: optionalText(80),
  website: optionalText(300),
  segment: companySegment.default('OTHER'),
  source: leadSource.default('MANUAL'),
  tags: tags.optional(),
  notes: z.string().trim().max(8000).optional(),
});

export const companyUpdateSchema = companyCreateSchema.partial();

export const companyListQuery = pagination.extend({
  q: optionalText(200),
  segment: companySegment.optional(),
  country: optionalText(80),
  tag: optionalText(40),
});

export const contactCreateSchema = z.object({
  name: requiredText('A contact name', 120),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  whatsapp: optionalText(40),
  phone: optionalText(40),
  jobTitle: optionalText(120),
  isPrimary: z.boolean().default(false),
  notes: z.string().trim().max(4000).optional(),
});

export const contactUpdateSchema = contactCreateSchema.partial();

export const leadCreateSchema = z.object({
  title: requiredText('A short description of the opportunity', 200),
  companyId: optionalText(64),
  contactId: optionalText(64),
  stage: leadStage.default('NEW'),
  source: leadSource.default('MANUAL'),
  productId: optionalText(64),
  categoryId: optionalText(64),
  quantity: z.coerce.number().int().min(1).max(10_000_000).optional(),
  size: optionalText(64),
  customizationRequired: z.boolean().optional(),
  requirements: z.string().trim().max(8000).optional(),
  ownerId: optionalText(64),
  tags: tags.optional(),
  nextFollowUpAt: z.coerce.date().optional(),
});

/**
 * Everything about a lead except where it is in the pipeline.
 *
 * `stage` is omitted rather than merely ignored: moving a lead goes through
 * PATCH /leads/:id/stage, which writes the move and the LeadStageEvent in one
 * transaction. A stage changed through this route would leave no event, and a
 * timeline with a missing move is worse than no timeline — it reads as
 * authoritative and is wrong.
 */
export const leadUpdateSchema = leadCreateSchema.omit({ stage: true }).partial().extend({
  scoreOverride: leadScore.nullish(),
  scoreReason: z.string().trim().max(1000).nullish(),
  lostReason: optionalText(300),
});

export const leadStageMoveSchema = z.object({
  stage: leadStage,
  note: optionalText(300),
});

export const leadListQuery = pagination.extend({
  q: optionalText(200),
  stage: leadStage.optional(),
  score: leadScore.optional(),
  source: leadSource.optional(),
  companyId: optionalText(64),
  ownerId: optionalText(64),
  /** `yes` returns only leads whose follow-up date has passed. */
  overdue: z.enum(['yes', 'no']).optional(),
  open: z.enum(['yes', 'no']).optional(),
});
