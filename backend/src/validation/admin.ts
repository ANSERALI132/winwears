import { z } from 'zod';
import { boolish, email, optionalText, requiredText } from './common';

export const loginSchema = z.object({
  email,
  /* No complexity rule on sign-in: the stored hash decides, and a length
     check here would only tell an attacker about the password policy. */
  password: z.string().min(1, 'Enter your password.').max(200),
});

/**
 * New and changed passwords.
 *
 * Length is the requirement that actually correlates with strength, so the
 * floor is 12 characters rather than a menu of character-class rules.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(200, 'That password is too long.');

export const userCreateSchema = z.object({
  name: requiredText('Name', 120),
  email,
  password: passwordSchema,
  role: z.enum(['ADMIN', 'EDITOR']).default('EDITOR'),
  active: boolish.default(true),
});

export const userUpdateSchema = z
  .object({
    name: requiredText('Name', 120).optional(),
    email: email.optional(),
    password: passwordSchema.optional(),
    role: z.enum(['ADMIN', 'EDITOR']).optional(),
    active: boolish.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordSchema,
});

/** Settings are written as a flat map of key -> value. */
export const settingsUpdateSchema = z.object({
  values: z.record(z.string().max(64), z.string().max(4000)),
});

export const activityListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  entity: optionalText(64),
});
