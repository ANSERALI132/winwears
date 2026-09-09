/**
 * Production run numbering, progress, and which status can follow which.
 *
 * Progress is counted from output that was recorded, never inferred from the
 * stage a run is sitting in. A run parked in "packing" is not evidence that
 * anything has been packed — it is evidence that somebody moved a card.
 */
import type { ProductionStatus } from '@prisma/client';
import { prisma } from '../db';

const PREFIX = 'WW-PR';

/**
 * Allocates the next run reference.
 *
 * Same shape as every other reference in the project: count, then write under
 * the unique index and retry, because counting alone races two people
 * planning work at once.
 */
export async function nextRunReference(attempt = 0): Promise<string> {
  const year = new Date().getFullYear();
  const used = await prisma.productionRun.count({
    where: { reference: { startsWith: `${PREFIX}-${year}-` } },
  });
  return `${PREFIX}-${year}-${String(used + 1 + attempt).padStart(4, '0')}`;
}

export interface Progress {
  planned: number;
  good: number;
  rejected: number;
  /** Still to make. Never negative: an overrun is reported as an overrun. */
  remaining: number;
  /** Whole percent of the planned quantity that has passed, capped at 100. */
  percent: number;
  /** Rejected as a whole percent of everything made, for the QC screens. */
  rejectRate: number;
  overrun: boolean;
}

export function progressOf(
  planned: number,
  outputs: Array<{ quantityGood: number; quantityRejected: number }>,
): Progress {
  const target = Math.max(0, Math.trunc(Number(planned) || 0));
  const good = outputs.reduce((sum, o) => sum + (Number(o.quantityGood) || 0), 0);
  const rejected = outputs.reduce((sum, o) => sum + (Number(o.quantityRejected) || 0), 0);
  const made = good + rejected;

  return {
    planned: target,
    good,
    rejected,
    remaining: Math.max(0, target - good),
    percent: target > 0 ? Math.min(100, Math.round((good / target) * 100)) : 0,
    /* Rounded to one place: a reject rate of "3%" and one of "3.4%" are
       different conversations on a factory floor. */
    rejectRate: made > 0 ? Math.round((rejected / made) * 1000) / 10 : 0,
    overrun: good > target,
  };
}

/**
 * Which status may follow which.
 *
 * A completed run is not reopened — the units it made have gone into an
 * order. Work that turns out to be wrong is a new run, so the record of what
 * was made the first time survives.
 */
const FLOW: Record<ProductionStatus, ProductionStatus[]> = {
  PLANNED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canMove(from: ProductionStatus, to: ProductionStatus): boolean {
  return from === to || FLOW[from].includes(to);
}

export function allowedNext(from: ProductionStatus): ProductionStatus[] {
  return FLOW[from];
}

const readable = (status: ProductionStatus): string => status.toLowerCase().replace(/_/g, ' ');

/** Human wording for the refusal, so the screen does not invent its own. */
export function refusalFor(from: ProductionStatus, to: ProductionStatus): string {
  if (FLOW[from].length === 0) {
    return `This run is ${readable(from)} and cannot be moved again. Raise a new run instead, so what this one made survives.`;
  }
  return `A run cannot go from ${readable(from)} to ${readable(to)}. It can go to: ${FLOW[from].join(', ')}.`;
}
