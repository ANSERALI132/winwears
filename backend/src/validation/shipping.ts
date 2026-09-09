import { z } from 'zod';
import { optionalText, pagination } from './common';

export const shipmentStatus = z.enum([
  'PREPARING', 'READY', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED',
]);

const units = z.coerce.number().int().min(1).max(10_000_000);

export const shipmentItemSchema = z.object({
  orderItemId: z.string().min(1).max(64),
  quantity: units,
});

export const shipmentCreateSchema = z.object({
  orderId: z.string().min(1, 'A shipment has to be against an order.').max(64),
  /* All free text. Which carriers WIN WEARS uses, what their services are
     called and which Incoterm was agreed are facts about this business and
     its contracts — a dropdown of guesses would be wrong for most of them and
     authoritative-looking for all of them. */
  carrier: optionalText(120),
  service: optionalText(120),
  incoterm: optionalText(40),
  trackingNumber: optionalText(120),
  /* Checked in the route rather than here, so the refusal can say what is
     wrong with it rather than "invalid url". */
  trackingUrl: optionalText(500),
  shipTo: z.string().trim().max(1000).optional(),
  packages: z.coerce.number().int().min(0).max(100_000).default(0),
  /* Null means nobody has weighed it, which is not the same as zero. */
  weightKg: z.coerce.number().min(0).max(1_000_000).nullish(),
  dimensions: optionalText(200),
  expectedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
  items: z.array(shipmentItemSchema).max(200).optional(),
});

/** Order is not settable on update: moving a packed consignment to a
 *  different order would carry its contents to lines that never ordered
 *  them. Raise a new shipment instead. */
export const shipmentUpdateSchema = shipmentCreateSchema.partial().omit({ orderId: true });

export const shipmentItemsSchema = z.object({
  items: z.array(shipmentItemSchema).min(1, 'A shipment needs at least one line.').max(200),
});

export const shipmentStatusSchema = z.object({
  status: shipmentStatus,
  note: optionalText(500),
  reason: optionalText(500),
});

export const shipmentListQuery = pagination.extend({
  q: optionalText(200),
  status: shipmentStatus.optional(),
  orderId: optionalText(64),
  /* Expected before today and not delivered. The list somebody works from
     when a customer rings. */
  overdue: z.enum(['1', 'true']).optional(),
});
