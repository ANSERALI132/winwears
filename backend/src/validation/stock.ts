import { z } from 'zod';
import { optionalText, pagination, requiredText } from './common';

export const stockKind = z.enum(['MATERIAL', 'FINISHED']);
export const stockMoveKind = z.enum([
  'RECEIPT', 'ISSUE', 'PRODUCTION', 'RETURN', 'WRITE_OFF', 'ADJUSTMENT',
]);

/* Three decimal places, because material is bought by the metre and the kilo.
   Capped high enough for any real delivery and low enough that a slipped
   decimal point is caught rather than counted. */
const quantity = z.coerce.number().min(-9_999_999).max(9_999_999);
const positiveQuantity = z.coerce.number().gt(0, 'A movement of nothing says nothing.').max(9_999_999);

export const locationCreateSchema = z.object({
  name: requiredText('A location name', 80),
  description: optionalText(500),
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.coerce.boolean().default(true),
});

export const locationUpdateSchema = locationCreateSchema.partial();

export const itemCreateSchema = z.object({
  name: requiredText('An item name', 160),
  sku: requiredText('A code', 64),
  description: optionalText(500),
  kind: stockKind.default('MATERIAL'),
  unit: optionalText(24),
  productId: optionalText(64),
  /* Null is a real answer: nobody has set a level, and then nothing is
     flagged. The system does not decide what running low means for somebody
     else's materials. */
  reorderLevel: z.coerce.number().min(0).max(9_999_999).nullish(),
  active: z.coerce.boolean().default(true),
  notes: z.string().trim().max(4000).optional(),
});

export const itemUpdateSchema = itemCreateSchema.partial();

export const movementCreateSchema = z
  .object({
    itemId: z.string().min(1).max(64),
    locationId: optionalText(64),
    kind: stockMoveKind,
    /* Signed only for an adjustment; for every other kind the sign comes from
       the kind and whatever arrives here is treated as a magnitude. */
    quantity,
    runId: optionalText(64),
    orderId: optionalText(64),
    reference: optionalText(120),
    note: optionalText(500),
    occurredAt: z.coerce.date().optional(),
  })
  .refine((v) => v.kind === 'ADJUSTMENT' || Math.abs(v.quantity) > 0, {
    path: ['quantity'],
    message: 'A movement of nothing says nothing.',
  })
  .refine((v) => v.kind !== 'ADJUSTMENT' || v.quantity !== 0, {
    path: ['quantity'],
    message: 'An adjustment of zero changes nothing. Say how far out the count was.',
  })
  .refine((v) => v.kind !== 'ADJUSTMENT' || Boolean(v.note && v.note.trim()), {
    path: ['note'],
    message: 'An adjustment needs a reason — "the count was wrong" has to say how.',
  });

/** Several movements at once, for a delivery covering a dozen materials. */
export const bulkMovementSchema = z.object({
  kind: stockMoveKind,
  locationId: optionalText(64),
  runId: optionalText(64),
  orderId: optionalText(64),
  reference: optionalText(120),
  occurredAt: z.coerce.date().optional(),
  lines: z
    .array(z.object({ itemId: z.string().min(1).max(64), quantity: positiveQuantity, note: optionalText(500) }))
    .min(1, 'Add at least one line.')
    .max(100),
});

export const itemListQuery = pagination.extend({
  q: optionalText(200),
  kind: stockKind.optional(),
  /* Only what needs ordering. The list a buyer opens first. */
  low: z.enum(['1', 'true']).optional(),
  includeRetired: z.enum(['1', 'true']).optional(),
});

export const movementListQuery = pagination.extend({
  itemId: optionalText(64),
  kind: stockMoveKind.optional(),
  runId: optionalText(64),
  orderId: optionalText(64),
});
