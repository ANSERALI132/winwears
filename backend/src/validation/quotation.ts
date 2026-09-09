import { z } from 'zod';
import { optionalText, pagination, requiredText } from './common';

export const quotationStatus = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED']);
export const discountType = z.enum(['NONE', 'PERCENT', 'AMOUNT']);

/** Money as entered by a person. Capped high enough for any real order and
 *  low enough that a slipped decimal point is caught rather than quoted. */
const money = z.coerce.number().min(0).max(99_999_999);

export const quotationItemSchema = z.object({
  productId: optionalText(64),
  description: requiredText('A description', 300),
  quantity: z.coerce.number().int().min(1).max(10_000_000),
  unitPrice: money,
});

export const quotationCreateSchema = z.object({
  companyId: optionalText(64),
  contactId: optionalText(64),
  leadId: optionalText(64),
  requestId: optionalText(64),
  /* Three letters, uppercased. Not an enum: a manufacturer quoting into new
     markets should not need a code change to quote in their currency. */
  currency: z.string().trim().length(3).transform((c) => c.toUpperCase()).default('USD'),
  items: z.array(quotationItemSchema).min(1, 'A quotation needs at least one line.').max(60),
  discountType: discountType.default('NONE'),
  discountInput: money.default(0),
  shipping: money.default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  paymentTerms: optionalText(300),
  packaging: optionalText(300),
  leadTime: optionalText(200),
  validUntil: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
});

/** Status is not settable here: sending, accepting and declining are events
 *  with their own endpoint, because each stamps a date and a sent quotation
 *  that silently became a draft again would be a document nobody can trust. */
export const quotationUpdateSchema = quotationCreateSchema.partial();

export const quotationStatusSchema = z.object({
  status: quotationStatus,
});

export const quotationListQuery = pagination.extend({
  q: optionalText(200),
  status: quotationStatus.optional(),
  companyId: optionalText(64),
  leadId: optionalText(64),
});
