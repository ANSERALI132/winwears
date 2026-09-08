/**
 * Tool contract.
 *
 * A tool is the only way the agent can learn a fact. The model never composes
 * a query — it picks a tool name and supplies arguments, which are validated
 * against a Zod schema before anything touches the database. That is what
 * keeps "never invent product information" enforceable rather than merely
 * requested: if a tool did not return it, the model has no way to know it.
 */
import type { z } from 'zod';
import type { AIToolDefinition } from '../provider';

export interface AITool<Input = unknown> {
  definition: AIToolDefinition;
  /** Validates whatever the model produced. Rejection is reported back to the
   *  model as a tool error so it can correct itself, not thrown at the user.
   *
   *  The third parameter is `unknown` on purpose: what arrives is arbitrary
   *  JSON from the model, and a schema using .default() has an input type
   *  that differs from its output. Pinning the input to the output type would
   *  reject exactly the schemas that supply defaults. */
  schema: z.ZodType<Input, z.ZodTypeDef, unknown>;
  run(input: Input): Promise<unknown>;
}

/** Heterogeneous tools in one registry. The executor is the only caller and
 *  validates before invoking, so the erased input type is safe here. */
export type AnyAITool = AITool<never>;

/**
 * Drops null, undefined and empty-string fields.
 *
 * Two reasons. Tokens: a football with eleven unset columns should not cost
 * eleven lines of `null` on every search result. And honesty: an absent key
 * reads as "not in the record", where `"weight": null` invites the model to
 * treat the field as a blank worth filling in. The system prompt states the
 * rule; this makes the data match it.
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}
