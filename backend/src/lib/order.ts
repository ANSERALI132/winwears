/**
 * Order numbering, payment position, and which status can follow which.
 *
 * The money arithmetic is not repeated here. An order's totals are the
 * quotation's totals, computed once by lib/quotation.ts and copied when the
 * customer accepts — a second implementation would eventually disagree with
 * the first, and the document the customer is holding would stop matching the
 * order we are working to.
 */
import type { OrderStatus } from '@prisma/client';
import { prisma } from '../db';
import { decimalToNumber } from './quotation';

const PREFIX = 'WW-SO';

/**
 * Allocates the next order number.
 *
 * Same shape as the RFQ, lead and quotation references: count, then write
 * under the unique index and retry, because counting alone races two people
 * confirming orders at once.
 */
export async function nextOrderNumber(attempt = 0): Promise<string> {
  const year = new Date().getFullYear();
  const used = await prisma.order.count({ where: { number: { startsWith: `${PREFIX}-${year}-` } } });
  return `${PREFIX}-${year}-${String(used + 1 + attempt).padStart(4, '0')}`;
}

/**
 * What is still owed.
 *
 * Derived from the payments actually recorded rather than stored as a status
 * column. A stored "deposit paid" is a second copy of a fact the payment rows
 * already hold, and the two disagree the first time somebody corrects a
 * misheard amount. Payment terms say what was agreed; only a payment row is
 * evidence that money arrived.
 */
export interface Balance {
  total: number;
  paid: number;
  balance: number;
  /** UNPAID, PART_PAID or PAID — for display, computed, never written down. */
  label: 'UNPAID' | 'PART_PAID' | 'PAID' | 'OVERPAID';
}

export function balanceOf(
  total: { toString(): string } | number,
  payments: Array<{ amount: { toString(): string } | number }>,
): Balance {
  const totalMinor = Math.round(decimalToNumber(total as never) * 100);
  const paidMinor = payments.reduce(
    (sum, p) => sum + Math.round(decimalToNumber(p.amount as never) * 100),
    0,
  );
  const balanceMinor = totalMinor - paidMinor;

  let label: Balance['label'] = 'PART_PAID';
  if (paidMinor <= 0) label = 'UNPAID';
  else if (balanceMinor === 0) label = 'PAID';
  else if (balanceMinor < 0) label = 'OVERPAID';

  return {
    total: totalMinor / 100,
    paid: paidMinor / 100,
    balance: balanceMinor / 100,
    label,
  };
}

/**
 * Which status may follow which.
 *
 * An order does not go from DELIVERED back to IN_PRODUCTION, and letting the
 * screen decide means every screen has to remember. ON_HOLD and CANCELLED are
 * reachable from anywhere that is not already finished, because real orders
 * are held and cancelled at every point.
 */
const FLOW: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ['IN_PRODUCTION', 'ON_HOLD', 'CANCELLED'],
  IN_PRODUCTION: ['QUALITY_CHECK', 'READY_TO_SHIP', 'ON_HOLD', 'CANCELLED'],
  QUALITY_CHECK: ['IN_PRODUCTION', 'READY_TO_SHIP', 'ON_HOLD', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'ON_HOLD', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'ON_HOLD'],
  DELIVERED: ['COMPLETED', 'ON_HOLD'],
  /* Finished. A completed order that needs changing is a new order, or a
     credit note — not a status somebody quietly reopened. */
  COMPLETED: [],
  /* A held order resumes wherever it was held from, so every working status
     is reachable. Which one is the operator's judgement, not ours. */
  ON_HOLD: ['CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED'],
  CANCELLED: [],
};

export function canMove(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || FLOW[from].includes(to);
}

export function allowedNext(from: OrderStatus): OrderStatus[] {
  return FLOW[from];
}

/** Human wording for the refusal, so the screen does not have to invent one. */
export function refusalFor(from: OrderStatus, to: OrderStatus): string {
  if (FLOW[from].length === 0) {
    return `This order is ${from.toLowerCase().replace(/_/g, ' ')} and cannot be moved again.`;
  }
  return `An order cannot go from ${from.toLowerCase().replace(/_/g, ' ')} to ${to
    .toLowerCase()
    .replace(/_/g, ' ')}. It can go to: ${FLOW[from].join(', ')}.`;
}
