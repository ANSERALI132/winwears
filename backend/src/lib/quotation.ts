/**
 * Quotation arithmetic.
 *
 * Computed on the server, always. The browser shows a running total so the
 * person typing can see what they are building, but what gets stored and
 * what the customer is shown is calculated here — a total posted from a form
 * is a total somebody can edit.
 *
 * Everything is worked out in minor units (whole pence/cents) and converted
 * back once. 0.1 + 0.2 is not 0.3 in floating point, and a quotation that is
 * a penny out is a quotation the buyer queries.
 */
import type { DiscountType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  productId?: string | null;
}

export interface TotalsInput {
  items: LineInput[];
  discountType: DiscountType;
  discountInput: number;
  shipping: number;
  taxRate: number;
}

export interface Totals {
  lines: Array<LineInput & { lineTotal: number }>;
  subtotal: number;
  discountValue: number;
  shipping: number;
  taxValue: number;
  total: number;
}

const toMinor = (value: number): number => Math.round((Number(value) || 0) * 100);
const toMajor = (minor: number): number => Math.round(minor) / 100;

export function computeTotals(input: TotalsInput): Totals {
  const lines = input.items.map((item) => {
    const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0));
    const unitMinor = toMinor(item.unitPrice);
    return { ...item, quantity, lineTotal: toMajor(quantity * unitMinor) };
  });

  const subtotalMinor = lines.reduce((sum, l) => sum + toMinor(l.lineTotal), 0);

  let discountMinor = 0;
  if (input.discountType === 'PERCENT') {
    const pct = Math.min(100, Math.max(0, Number(input.discountInput) || 0));
    discountMinor = Math.round((subtotalMinor * pct) / 100);
  } else if (input.discountType === 'AMOUNT') {
    discountMinor = Math.max(0, toMinor(input.discountInput));
  }
  /* A discount cannot exceed what is being discounted; a negative subtotal
     would quietly turn into a credit note nobody meant to write. */
  discountMinor = Math.min(discountMinor, subtotalMinor);

  const shippingMinor = Math.max(0, toMinor(input.shipping));
  const netMinor = subtotalMinor - discountMinor;

  /* Tax on goods after discount plus shipping. Which of those is taxable
     varies by jurisdiction, and WIN WEARS has not told us theirs — this is
     the common case, and the rate defaults to zero so nobody is charged tax
     the business did not ask for. */
  const rate = Math.min(100, Math.max(0, Number(input.taxRate) || 0));
  const taxMinor = Math.round(((netMinor + shippingMinor) * rate) / 100);

  return {
    lines,
    subtotal: toMajor(subtotalMinor),
    discountValue: toMajor(discountMinor),
    shipping: toMajor(shippingMinor),
    taxValue: toMajor(taxMinor),
    total: toMajor(netMinor + shippingMinor + taxMinor),
  };
}

/** Prisma hands back Decimal objects; JSON should carry numbers. */
export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

const PREFIX = 'WW-Q';

/**
 * Allocates the next quotation number.
 *
 * Same shape as the RFQ and lead references: count, then write under the
 * unique index and retry, because two people quoting at once would otherwise
 * compute the same number.
 */
export async function nextQuotationNumber(attempt = 0): Promise<string> {
  const year = new Date().getFullYear();
  const used = await prisma.quotation.count({ where: { number: { startsWith: `${PREFIX}-${year}-` } } });
  return `${PREFIX}-${year}-${String(used + 1 + attempt).padStart(4, '0')}`;
}
