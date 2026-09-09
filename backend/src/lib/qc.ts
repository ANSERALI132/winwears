/**
 * Quality control: judging a reading against a checkpoint, and an inspection
 * against its results.
 *
 * The rule that matters here is what happens when nobody has set a limit. The
 * system does not invent a threshold and then judge a ball against it — if
 * WIN WEARS has not said what an acceptable weight is, the inspector's own
 * pass or fail stands, and the record says that is where the judgement came
 * from.
 */
import type { QcCheckKind, QcResultKind } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export interface Checkpoint {
  kind: QcCheckKind;
  minValue: Prisma.Decimal | number | null;
  maxValue: Prisma.Decimal | number | null;
  critical: boolean;
}

const num = (value: Prisma.Decimal | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value.toString());
};

export interface Judgement {
  passed: boolean;
  /** Where the pass or fail came from, so a report can say. */
  source: 'limits' | 'inspector';
  /** Why it failed, in plain words, when the limits decided it. */
  reason: string | null;
}

/**
 * Decides whether one reading passes.
 *
 * A measurement with limits is judged against them. Everything else — an
 * observation, or a measurement this factory has not set limits for — is the
 * inspector's call, and `passed` must therefore be supplied.
 */
export function judge(
  checkpoint: Checkpoint,
  value: number | null,
  inspectorSaid: boolean | null,
): Judgement {
  const min = num(checkpoint.minValue);
  const max = num(checkpoint.maxValue);
  const hasLimits = checkpoint.kind === 'MEASUREMENT' && (min !== null || max !== null);

  if (hasLimits && value !== null) {
    if (min !== null && value < min) {
      return { passed: false, source: 'limits', reason: `${value} is below the minimum of ${min}.` };
    }
    if (max !== null && value > max) {
      return { passed: false, source: 'limits', reason: `${value} is above the maximum of ${max}.` };
    }
    return { passed: true, source: 'limits', reason: null };
  }

  /* No limits, or no reading to judge. The person holding the ball decides,
     and refusing to guess on their behalf is the whole point. */
  return { passed: inspectorSaid === true, source: 'inspector', reason: null };
}

export interface ResultLine {
  passed: boolean;
  critical: boolean;
}

/**
 * The inspection's own outcome, from its results.
 *
 * A critical failure fails the inspection outright; nothing else can be
 * quietly averaged away. A non-critical failure also fails it — letting it
 * through is a decision somebody makes explicitly afterwards, recorded as a
 * concession with their name on it, rather than something this function does
 * for them.
 */
export function summarise(results: ResultLine[]): QcResultKind {
  if (!results.length) return 'PENDING';
  return results.every((r) => r.passed) ? 'PASSED' : 'FAILED';
}

/** Whether an inspection had a failure nobody may wave through. */
export function hasCriticalFailure(results: ResultLine[]): boolean {
  return results.some((r) => !r.passed && r.critical);
}

const PREFIX = 'WW-QC';

/**
 * Allocates the next inspection reference.
 *
 * Same shape as every other reference here: count, then write under the
 * unique index and retry, because counting alone races two inspectors
 * finishing at once.
 */
export async function nextInspectionReference(attempt = 0): Promise<string> {
  const year = new Date().getFullYear();
  const used = await prisma.qcInspection.count({
    where: { reference: { startsWith: `${PREFIX}-${year}-` } },
  });
  return `${PREFIX}-${year}-${String(used + 1 + attempt).padStart(4, '0')}`;
}
