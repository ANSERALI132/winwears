import { z } from 'zod';
import { optionalText, pagination, requiredText } from './common';

export const knowledgeStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

/** Groupings the admin screen offers. Free text underneath, so a business
 *  that needs a category nobody thought of is not blocked by a migration. */
export const KNOWLEDGE_CATEGORIES = [
  'general',
  'manufacturing',
  'customization',
  'shipping',
  'payment',
  'product-guidance',
  'company',
  'support',
] as const;

export const knowledgeCreateSchema = z.object({
  title: requiredText('A title', 200),
  /* Long, because a shipping policy is a policy. Capped so one entry cannot
     dominate the model's context window. */
  content: z.string().trim().min(1, 'Content is required.').max(8000),
  category: optionalText(60),
  status: knowledgeStatus.default('DRAFT'),
  priority: z.coerce.number().int().min(0).max(100).default(0),
});

export const knowledgeUpdateSchema = knowledgeCreateSchema.partial();

export const knowledgeListQuery = pagination.extend({
  q: optionalText(200),
  category: optionalText(60),
  status: knowledgeStatus.optional(),
});
