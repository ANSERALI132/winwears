/**
 * Shipment references, what is left to send, and which status can follow
 * which.
 *
 * The rule this file exists to enforce is that an order cannot be
 * over-shipped. What has gone is the sum of every shipment's lines, and what
 * is left is the order minus that — computed here so no screen has to work it
 * out and get it wrong.
 */
import type { ShipmentStatus } from '@prisma/client';
import { prisma } from '../db';

const PREFIX = 'WW-SH';

/**
 * Allocates the next shipment reference.
 *
 * Same shape as every other reference here: count, then write under the
 * unique index and retry, because counting alone races two people booking
 * consignments at once.
 */
export async function nextShipmentReference(attempt = 0): Promise<string> {
  const year = new Date().getFullYear();
  const used = await prisma.shipment.count({
    where: { reference: { startsWith: `${PREFIX}-${year}-` } },
  });
  return `${PREFIX}-${year}-${String(used + 1 + attempt).padStart(4, '0')}`;
}

/**
 * A tracking URL, or null.
 *
 * This value is typed by an admin and rendered as a link, which is precisely
 * where a `javascript:` URL gets in. Anything that is not plainly http or
 * https is refused rather than stored and cleaned up later — the value that
 * reaches the database is the one that is safe.
 */
export function safeTrackingUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}

export interface OutstandingLine {
  orderItemId: string;
  description: string;
  ordered: number;
  shipped: number;
  remaining: number;
}

/**
 * What is left to send on an order.
 *
 * `exclude` skips one shipment's own lines, so editing a consignment does not
 * count its current contents against itself and refuse a quantity it already
 * has.
 */
export function outstandingFor(
  items: Array<{ id: string; description: string; quantity: number }>,
  shipped: Array<{ orderItemId: string; quantity: number; shipmentId: string }>,
  exclude?: string,
): OutstandingLine[] {
  return items.map((item) => {
    const already = shipped
      .filter((s) => s.orderItemId === item.id && s.shipmentId !== exclude)
      .reduce((sum, s) => sum + s.quantity, 0);
    return {
      orderItemId: item.id,
      description: item.description,
      ordered: item.quantity,
      shipped: already,
      remaining: Math.max(0, item.quantity - already),
    };
  });
}

/** True when every line on the order has been fully sent. */
export function fullyShipped(lines: OutstandingLine[]): boolean {
  return lines.length > 0 && lines.every((l) => l.remaining === 0);
}

/**
 * Which status may follow which.
 *
 * A delivered shipment is finished. Something that arrives damaged is a
 * conversation and possibly a replacement consignment, not a status somebody
 * quietly winds back.
 */
const FLOW: Record<ShipmentStatus, ShipmentStatus[]> = {
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DISPATCHED', 'PREPARING', 'CANCELLED'],
  DISPATCHED: ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canMove(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return from === to || FLOW[from].includes(to);
}

export function allowedNext(from: ShipmentStatus): ShipmentStatus[] {
  return FLOW[from];
}

/** Once gone, the contents are what the customer will receive. */
export function isGone(status: ShipmentStatus): boolean {
  return status === 'DISPATCHED' || status === 'IN_TRANSIT' || status === 'DELIVERED';
}

const readable = (status: ShipmentStatus): string => status.toLowerCase().replace(/_/g, ' ');

/** Human wording for the refusal, so the screen does not invent its own. */
export function refusalFor(from: ShipmentStatus, to: ShipmentStatus): string {
  if (FLOW[from].length === 0) {
    return `This shipment is ${readable(from)} and cannot be moved again.`;
  }
  return `A shipment cannot go from ${readable(from)} to ${readable(to)}. It can go to: ${FLOW[from].join(', ')}.`;
}
