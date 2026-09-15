import { z } from 'zod';
import { boolish, optionalLongText, optionalText, requiredText } from './common';

export const categoryCreateSchema = z.object({
  name: requiredText('Category name', 120),
  slug: optionalText(120),
  shortDescription: optionalText(400),
  description: optionalLongText(8000),
  image: optionalText(500),
  displayOrder: z.coerce.number().int().min(0).default(0),
  /** Empty clears it. */
  parentId: optionalText(64),
  active: boolish.default(true),
  metaTitle: optionalText(200),
  metaDescription: optionalText(400),
});

export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
