import { z } from 'zod';
import { optionalText, pagination, requiredText } from './common';

export const qcCheckKind = z.enum(['MEASUREMENT', 'OBSERVATION']);
export const qcResultKind = z.enum(['PENDING', 'PASSED', 'FAILED', 'CONCESSION']);

/* A reading. Three decimal places, because a ball's weight is quoted in whole
   grams and its circumference to a millimetre, and rounding either away turns
   a fail into a pass. */
const reading = z.coerce.number().min(-1_000_000).max(1_000_000);

export const checkpointCreateSchema = z
  .object({
    name: requiredText('A checkpoint name', 120),
    description: optionalText(500),
    kind: qcCheckKind.default('OBSERVATION'),
    unit: optionalText(24),
    /* Null is a real answer: it means WIN WEARS has not set a limit, and the
       inspector's own judgement stands rather than the system inventing a
       threshold to judge a ball against. */
    minValue: reading.nullish(),
    maxValue: reading.nullish(),
    critical: z.coerce.boolean().default(false),
    displayOrder: z.coerce.number().int().min(0).max(9999).default(0),
    active: z.coerce.boolean().default(true),
  })
  .refine((v) => v.minValue == null || v.maxValue == null || v.minValue <= v.maxValue, {
    path: ['maxValue'],
    message: 'The maximum cannot be below the minimum.',
  })
  .refine((v) => v.kind === 'MEASUREMENT' || (v.minValue == null && v.maxValue == null), {
    path: ['minValue'],
    message: 'Limits only apply to a measurement. An observation is a yes or a no.',
  });

/* Not .partial() on the object above: a refined schema cannot be narrowed
   without losing the checks, so the shape is restated and re-refined. */
export const checkpointUpdateSchema = z
  .object({
    name: requiredText('A checkpoint name', 120).optional(),
    description: optionalText(500),
    kind: qcCheckKind.optional(),
    unit: optionalText(24),
    minValue: reading.nullish(),
    maxValue: reading.nullish(),
    critical: z.coerce.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(9999).optional(),
    active: z.coerce.boolean().optional(),
  })
  .refine((v) => v.minValue == null || v.maxValue == null || v.minValue <= v.maxValue, {
    path: ['maxValue'],
    message: 'The maximum cannot be below the minimum.',
  });

const units = z.coerce.number().int().min(0).max(10_000_000);

export const inspectionCreateSchema = z.object({
  runId: optionalText(64),
  orderId: optionalText(64),
  stageId: optionalText(64),
  inspectorId: optionalText(64),
  sampleSize: units.default(0),
  quantityPassed: units.default(0),
  quantityFailed: units.default(0),
  inspectedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const inspectionUpdateSchema = inspectionCreateSchema.partial();

/** One checkpoint's outcome. `passed` is what the inspector says; it is only
 *  used when the checkpoint has no limits to decide for itself. */
export const resultSchema = z.object({
  checkpointId: z.string().min(1).max(64),
  value: reading.nullish(),
  passed: z.coerce.boolean().optional(),
  note: optionalText(500),
});

export const resultsSchema = z.object({
  results: z.array(resultSchema).min(1, 'Record at least one checkpoint.').max(100),
});

/** Completing locks the inspection. Nothing here can be changed afterwards,
 *  because an inspection that can be edited is not evidence of anything. */
export const completeSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
});

/** Letting a failed inspection through, on somebody's name. */
export const overrideSchema = z.object({
  result: z.enum(['PASSED', 'FAILED', 'CONCESSION']),
  reason: requiredText('A reason', 1000),
});

export const inspectionListQuery = pagination.extend({
  q: optionalText(200),
  result: qcResultKind.optional(),
  runId: optionalText(64),
  orderId: optionalText(64),
  /* Inspections still open. The list a QC lead reads first. */
  open: z.enum(['1', 'true']).optional(),
});
