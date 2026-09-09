import { z } from 'zod';
import { optionalText, pagination } from './common';
import { discountType, quotationItemSchema } from './quotation';

export const orderStatus = z.enum([
  'CONFIRMED',
  'IN_PRODUCTION',
  'QUALITY_CHECK',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
]);

const money = z.coerce.number().min(0).max(99_999_999);

/** An order line is a quotation line: same shape, same limits, same rules.
 *  Two definitions would drift, and a line that is valid on the quotation but
 *  refused on the order it became is a conversion that fails at the worst
 *  possible moment. */
export const orderItemSchema = quotationItemSchema;

export const orderCreateSchema = z.object({
  companyId: optionalText(64),
  contactId: optionalText(64),
  leadId: optionalText(64),
  quotationId: optionalText(64),
  requestId: optionalText(64),
  poNumber: optionalText(120),
  currency: z.string().trim().length(3).transform((c) => c.toUpperCase()).default('USD'),
  items: z.array(orderItemSchema).min(1, 'An order needs at least one line.').max(60),
  discountType: discountType.default('NONE'),
  discountInput: money.default(0),
  shipping: money.default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  paymentTerms: optionalText(300),
  packaging: optionalText(300),
  requiredBy: z.coerce.date().optional(),
  promisedAt: z.coerce.date().optional(),
  shipTo: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(4000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
});

/** Status is not settable here. Moving an order is an event with its own
 *  endpoint: it records who moved it and from where, and a status changed
 *  alongside a delivery date would lose which of the two the customer was
 *  told about. */
export const orderUpdateSchema = orderCreateSchema.partial();

export const orderStatusSchema = z.object({
  status: orderStatus,
  note: optionalText(500),
  /* Required when cancelling. Checked in the route rather than here, so the
     message names the field the operator is looking at. */
  reason: optionalText(500),
});

/** What is added to an order when the customer accepts the quotation. Only
 *  the fields the order needs that the quotation does not already carry. */
export const orderFromQuotationSchema = z.object({
  poNumber: optionalText(120),
  requiredBy: z.coerce.date().optional(),
  promisedAt: z.coerce.date().optional(),
  shipTo: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
});

export const paymentCreateSchema = z.object({
  /* Above zero: a payment of nothing is a mistake, and a refund is a separate
     thing that should be recorded as one rather than as negative money. */
  amount: z.coerce.number().gt(0, 'A payment must be more than zero.').max(99_999_999),
  method: optionalText(120),
  reference: optionalText(120),
  receivedAt: z.coerce.date().optional(),
  note: optionalText(500),
});

export const orderListQuery = pagination.extend({
  q: optionalText(200),
  status: orderStatus.optional(),
  companyId: optionalText(64),
  leadId: optionalText(64),
  /* Orders whose promised date has passed and are not yet shipped. The
     question the production floor asks first. */
  late: z.enum(['1', 'true']).optional(),
  unpaid: z.enum(['1', 'true']).optional(),
});

