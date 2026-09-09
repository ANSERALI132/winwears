import { z } from 'zod';
import { optionalText, pagination, requiredText } from './common';

export const productionStatus = z.enum(['PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);

/* A factory's own process steps. Nothing is seeded and nothing is suggested:
   a hand-stitched ball and a thermo-bonded one do not go through the same
   stages, and a made-up list would read as though somebody had surveyed the
   floor. */
export const stageCreateSchema = z.object({
  name: requiredText('A stage name', 80),
  description: optionalText(500),
  displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.coerce.boolean().default(true),
});

export const stageUpdateSchema = stageCreateSchema.partial();

export const stageReorderSchema = z.object({
  order: z.array(z.string().min(1).max(64)).min(1).max(100),
});

/** Units are whole things. A factory does not make 4.5 footballs. */
const units = z.coerce.number().int().min(0).max(10_000_000);

export const runCreateSchema = z.object({
  title: requiredText('A description of the work', 200),
  orderId: optionalText(64),
  orderItemId: optionalText(64),
  productId: optionalText(64),
  quantityPlanned: z.coerce.number().int().min(1, 'A run needs a quantity.').max(10_000_000),
  ownerId: optionalText(64),
  plannedStart: z.coerce.date().optional(),
  plannedEnd: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional(),
});

/** Status and stage are not settable here: each is a movement with its own
 *  endpoint, recording who moved it and from where. A stage changed silently
 *  alongside a date would lose the one thing the history is for. */
export const runUpdateSchema = runCreateSchema.partial();

export const runStatusSchema = z.object({
  status: productionStatus,
  note: optionalText(500),
  /* Required when cancelling — checked in the route so the message names the
     field the supervisor is looking at. */
  reason: optionalText(500),
});

export const runStageSchema = z.object({
  /* Null moves a run back to "not started at any stage", which is a real
     thing to want after a run is reset. */
  stageId: z.string().min(1).max(64).nullable(),
  note: optionalText(500),
});

export const outputCreateSchema = z
  .object({
    stageId: optionalText(64),
    quantityGood: units.default(0),
    quantityRejected: units.default(0),
    recordedAt: z.coerce.date().optional(),
    note: optionalText(500),
  })
  .refine((v) => v.quantityGood > 0 || v.quantityRejected > 0, {
    message: 'Record how many passed, how many failed, or both — an entry of nothing says nothing.',
  });

export const runListQuery = pagination.extend({
  q: optionalText(200),
  status: productionStatus.optional(),
  orderId: optionalText(64),
  stageId: optionalText(64),
  ownerId: optionalText(64),
  /* Runs due in the past that are not finished. The question the factory
     floor asks first. */
  late: z.enum(['1', 'true']).optional(),
});
