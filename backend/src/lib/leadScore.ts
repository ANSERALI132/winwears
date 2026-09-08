/**
 * Lead scoring.
 *
 * Sorts the admin's queue, nothing more. The score says how much a visitor
 * has told us, which correlates with seriousness but is not a judgement about
 * the buyer and must never be shown to one. A quiet enquiry from a large club
 * scores LOW here; that is a limitation of counting signals, and the reason
 * this orders a list rather than filtering one.
 *
 * Deliberately transparent arithmetic rather than a model: a salesperson
 * should be able to see why a row is near the top.
 */
import type { AILeadScore } from '@prisma/client';

export interface LeadSignals {
  quantity?: number | null;
  company?: string | null;
  country?: string | null;
  email?: string | null;
  whatsapp?: string | null
  customizationRequired?: boolean | null;
  productInterest?: boolean;
  quoteSubmitted?: boolean;
}

export function scoreLead(s: LeadSignals): AILeadScore {
  let points = 0;

  /* Quantity is the strongest signal a B2B enquiry gives, so it is banded
     rather than binary. The bands are order-of-magnitude, not tuned. */
  if (s.quantity && s.quantity >= 1000) points += 4;
  else if (s.quantity && s.quantity >= 250) points += 3;
  else if (s.quantity && s.quantity >= 50) points += 2;
  else if (s.quantity) points += 1;

  /* A way to reply is worth more than anything describing the enquiry: a
     detailed requirement with no contact route cannot be acted on. */
  if (s.email) points += 2;
  if (s.whatsapp) points += 2;

  if (s.company) points += 2;
  if (s.country) points += 1;
  if (s.customizationRequired) points += 1;
  if (s.productInterest) points += 1;

  /* Someone who finished the request has done everything we asked. */
  if (s.quoteSubmitted) points += 3;

  if (points >= 10) return 'URGENT';
  if (points >= 7) return 'HIGH';
  if (points >= 4) return 'MEDIUM';
  return 'LOW';
}
