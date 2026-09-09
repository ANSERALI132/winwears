/**
 * Stock arithmetic.
 *
 * A level is the sum of the movements underneath it — never a stored number
 * that gets incremented. That is the same rule as payments against an order
 * and output against a production run, and for the same reason: a second copy
 * of a fact is a fact that can disagree with itself, and the first correction
 * is when it does.
 *
 * Everything is worked out in thousandths, because material is measured in
 * metres and kilos to three places and 0.1 + 0.2 is not 0.3 in floating point.
 * A stock figure that is a gram out is a stock figure somebody stops trusting.
 */
import type { StockMoveKind } from '@prisma/client';
import { Prisma } from '@prisma/client';

const SCALE = 1000;

const toMilli = (value: number): number => Math.round((Number(value) || 0) * SCALE);
const toUnits = (milli: number): number => Math.round(milli) / SCALE;

export const decimalToNumber = (value: Prisma.Decimal | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
};

/**
 * Which way each kind moves stock.
 *
 * The direction belongs to the kind, not to whoever is typing: an issue can
 * never be entered as an increase, and nobody has to remember a minus sign at
 * the end of a long day. An adjustment is the one kind that may go either
 * way, because a stocktake can find stock as easily as lose it.
 */
const DIRECTION: Record<StockMoveKind, 1 | -1 | 0> = {
  RECEIPT: 1,
  PRODUCTION: 1,
  RETURN: 1,
  ISSUE: -1,
  WRITE_OFF: -1,
  ADJUSTMENT: 0,
};

/** True when the kind takes a signed quantity from the caller. */
export const isSignedKind = (kind: StockMoveKind): boolean => DIRECTION[kind] === 0;

/**
 * The signed quantity to store, from a kind and a magnitude.
 *
 * For every kind but ADJUSTMENT the caller's sign is discarded outright — the
 * magnitude is what they meant, and the kind says the rest.
 */
export function signedQuantity(kind: StockMoveKind, quantity: number): number {
  const direction = DIRECTION[kind];
  if (direction === 0) return toUnits(toMilli(quantity));
  return toUnits(Math.abs(toMilli(quantity)) * direction);
}

export interface Level {
  onHand: number;
  /** What has come in and gone out, so a screen can show the shape of it. */
  received: number;
  issued: number;
  reorderLevel: number | null;
  /** Only ever true when a reorder level has actually been set. */
  low: boolean;
  /** Stock cannot really be negative; when the ledger says it is, the count
   *  is wrong and somebody needs to know rather than see a tidy zero. */
  negative: boolean;
}

export function levelOf(
  movements: Array<{ quantity: Prisma.Decimal | number }>,
  reorderLevel: Prisma.Decimal | number | null | undefined,
): Level {
  let inMilli = 0;
  let outMilli = 0;

  for (const movement of movements) {
    const milli = toMilli(decimalToNumber(movement.quantity));
    if (milli >= 0) inMilli += milli;
    else outMilli += -milli;
  }

  const onHandMilli = inMilli - outMilli;
  const onHand = toUnits(onHandMilli);
  const reorder = reorderLevel === null || reorderLevel === undefined ? null : decimalToNumber(reorderLevel);

  return {
    onHand,
    received: toUnits(inMilli),
    issued: toUnits(outMilli),
    reorderLevel: reorder,
    /* No reorder level means nothing is flagged. The system does not decide
       for a factory what running low means for its own materials. */
    low: reorder !== null && onHandMilli <= toMilli(reorder),
    negative: onHandMilli < 0,
  };
}

/** Plain words for a movement kind, for a ledger somebody reads. */
export function describeKind(kind: StockMoveKind): string {
  switch (kind) {
    case 'RECEIPT': return 'Received';
    case 'ISSUE': return 'Issued to production';
    case 'PRODUCTION': return 'Made';
    case 'RETURN': return 'Returned';
    case 'WRITE_OFF': return 'Written off';
    case 'ADJUSTMENT': return 'Stocktake adjustment';
    default: return kind;
  }
}
