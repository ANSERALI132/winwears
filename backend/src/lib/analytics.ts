/**
 * Reporting.
 *
 * Nothing here is stored, cached or estimated: every figure is counted from
 * rows at the moment it is asked for. There are no new tables, because a
 * reporting table is a second copy of a number that can disagree with the
 * first, and the volumes here are small enough that counting properly costs
 * nothing.
 *
 * Two rules run through the whole file.
 *
 * Money is never added across currencies. Every money series is per currency,
 * and there is no combined total anywhere for a screen to reach for.
 *
 * A rate is never computed over a subset without saying so. Orders with no
 * promised date cannot be judged late or on time; they are excluded from the
 * rate and reported as excluded, because a delivery figure quietly calculated
 * over a third of the orders is worse than no figure.
 */
import { prisma } from '../db';

/** Rows fetched for grouping. Well above anything this business will produce
 *  in a reporting window, and a ceiling rather than a silent truncation: the
 *  caller is told when it is hit. */
const MAX_ROWS = 5000;

const toMinor = (value: { toString(): string } | number): number =>
  Math.round(Number(typeof value === 'number' ? value : value.toString()) * 100);
const toMajor = (minor: number): number => Math.round(minor) / 100;

export interface Bucket {
  /** YYYY-MM, so a chart can sort lexicographically and a person can read it. */
  month: string;
  label: string;
}

/**
 * The months in the window, including the ones with nothing in them.
 *
 * A month with no orders is a fact worth seeing. Leaving it out would draw a
 * line straight from January to March and make a quiet February disappear.
 */
export function monthsBack(count: number): Bucket[] {
  const out: Bucket[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    });
  }
  return out;
}

const monthOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const startOf = (buckets: Bucket[]): Date => {
  const first = buckets[0]?.month ?? monthOf(new Date());
  const [year, month] = first.split('-').map(Number);
  return new Date(Date.UTC(year as number, (month as number) - 1, 1));
};

/* ----------------------------------------------------------------- sales -- */

export interface SalesReport {
  months: Bucket[];
  /** One series per currency. Never combined. */
  series: Array<{ currency: string; orders: number[]; value: number[]; total: number; count: number }>;
  currencies: string[];
  truncated: boolean;
}

export async function salesByMonth(months: number): Promise<SalesReport> {
  const buckets = monthsBack(months);

  const rows = await prisma.order.findMany({
    where: { confirmedAt: { gte: startOf(buckets) }, status: { not: 'CANCELLED' } },
    select: { confirmedAt: true, currency: true, total: true },
    take: MAX_ROWS,
  });

  const index = new Map(buckets.map((b, i) => [b.month, i]));
  const byCurrency = new Map<string, { orders: number[]; minor: number[] }>();

  for (const row of rows) {
    const at = index.get(monthOf(row.confirmedAt));
    if (at === undefined) continue;
    const key = row.currency || 'UNKNOWN';
    let series = byCurrency.get(key);
    if (!series) {
      series = {
        orders: new Array<number>(buckets.length).fill(0),
        minor: new Array<number>(buckets.length).fill(0),
      };
      byCurrency.set(key, series);
    }
    series.orders[at] = (series.orders[at] ?? 0) + 1;
    series.minor[at] = (series.minor[at] ?? 0) + toMinor(row.total);
  }

  const series = [...byCurrency.entries()]
    .map(([currency, s]) => ({
      currency,
      orders: s.orders,
      value: s.minor.map(toMajor),
      total: toMajor(s.minor.reduce((a, b) => a + b, 0)),
      count: s.orders.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    months: buckets,
    series,
    currencies: series.map((s) => s.currency),
    truncated: rows.length === MAX_ROWS,
  };
}

/* ------------------------------------------------------------- quotations -- */

export interface FunnelReport {
  requests: number;
  quotationsRaised: number;
  quotationsSent: number;
  accepted: number;
  declined: number;
  stillOut: number;
  /** Of the quotations that were decided, how many were won. Quotations still
   *  out are excluded and counted, because counting them as losses would make
   *  a busy month look like a bad one. */
  decided: number;
  winRatePercent: number | null;
  note: string;
}

export async function quotationFunnel(since: Date): Promise<FunnelReport> {
  const [requests, raised, sent, accepted, declined, expired] = await Promise.all([
    prisma.quoteRequest.count({ where: { createdAt: { gte: since } } }),
    prisma.quotation.count({ where: { createdAt: { gte: since } } }),
    prisma.quotation.count({ where: { createdAt: { gte: since }, status: { not: 'DRAFT' } } }),
    prisma.quotation.count({ where: { createdAt: { gte: since }, status: 'ACCEPTED' } }),
    prisma.quotation.count({ where: { createdAt: { gte: since }, status: 'DECLINED' } }),
    prisma.quotation.count({ where: { createdAt: { gte: since }, status: 'EXPIRED' } }),
  ]);

  const decided = accepted + declined + expired;
  const stillOut = Math.max(0, sent - decided);

  return {
    requests,
    quotationsRaised: raised,
    quotationsSent: sent,
    accepted,
    declined: declined + expired,
    stillOut,
    decided,
    /* Null rather than zero when nothing has been decided: no win rate is a
       different statement from a win rate of nought. */
    winRatePercent: decided > 0 ? Math.round((accepted / decided) * 1000) / 10 : null,
    note: decided === 0
      ? 'No quotation from this period has been accepted or declined yet, so there is no win rate to report.'
      : `${stillOut} quotation${stillOut === 1 ? ' is' : 's are'} still out and excluded from the rate.`,
  };
}

/* -------------------------------------------------------------- customers -- */

export interface CustomerRow {
  id: string;
  name: string;
  country: string | null;
  currency: string;
  orders: number;
  value: number;
  outstanding: number;
}

/** Ranked within each currency, because ranking across them would order
 *  customers by exchange rate rather than by value. */
export async function topCustomers(since: Date, limit = 10): Promise<CustomerRow[]> {
  const rows = await prisma.order.findMany({
    where: { confirmedAt: { gte: since }, status: { not: 'CANCELLED' } },
    select: {
      currency: true,
      total: true,
      payments: { select: { amount: true } },
      company: { select: { id: true, name: true, country: true } },
    },
    take: MAX_ROWS,
  });

  const grouped = new Map<string, CustomerRow>();
  for (const row of rows) {
    if (!row.company) continue;
    const key = `${row.company.id}:${row.currency}`;
    const entry = grouped.get(key) ?? {
      id: row.company.id,
      name: row.company.name,
      country: row.company.country,
      currency: row.currency,
      orders: 0,
      value: 0,
      outstanding: 0,
    };
    const paid = row.payments.reduce((sum, p) => sum + toMinor(p.amount), 0);
    entry.orders += 1;
    entry.value = toMajor(toMinor(entry.value) + toMinor(row.total));
    entry.outstanding = toMajor(toMinor(entry.outstanding) + (toMinor(row.total) - paid));
    grouped.set(key, entry);
  }

  return [...grouped.values()]
    .sort((a, b) => (a.currency === b.currency ? b.value - a.value : a.currency.localeCompare(b.currency)))
    .slice(0, limit * 3);
}

/* --------------------------------------------------------------- pipeline -- */

export interface PipelineReport {
  openByStage: Record<string, number>;
  wonInPeriod: number;
  lostInPeriod: number;
  winRatePercent: number | null;
  bySource: Array<{ source: string; total: number; won: number }>;
  unowned: number;
  note: string;
}

export async function pipelineReport(since: Date): Promise<PipelineReport> {
  const [open, won, lost, closed, unowned] = await Promise.all([
    prisma.lead.groupBy({ by: ['stage'], where: { closedAt: null }, _count: { _all: true } }),
    prisma.lead.count({ where: { stage: 'WON', closedAt: { gte: since } } }),
    prisma.lead.count({ where: { stage: 'LOST', closedAt: { gte: since } } }),
    prisma.lead.findMany({
      where: { closedAt: { gte: since } },
      select: { source: true, stage: true },
      take: MAX_ROWS,
    }),
    prisma.lead.count({ where: { closedAt: null, ownerId: null } }),
  ]);

  const sources = new Map<string, { total: number; won: number }>();
  for (const lead of closed) {
    const entry = sources.get(lead.source) ?? { total: 0, won: 0 };
    entry.total += 1;
    if (lead.stage === 'WON') entry.won += 1;
    sources.set(lead.source, entry);
  }

  const settled = won + lost;

  return {
    openByStage: Object.fromEntries(open.map((s) => [s.stage, s._count._all])),
    wonInPeriod: won,
    lostInPeriod: lost,
    winRatePercent: settled > 0 ? Math.round((won / settled) * 1000) / 10 : null,
    bySource: [...sources.entries()]
      .map(([source, v]) => ({ source, total: v.total, won: v.won }))
      .sort((a, b) => b.total - a.total),
    unowned,
    note: settled === 0
      ? 'No opportunity was won or lost in this period, so there is no win rate to report.'
      : 'Opportunities still open are not counted either way.',
  };
}

/* -------------------------------------------------------------- delivery -- */

export interface DeliveryReport {
  measured: number;
  onTime: number;
  late: number;
  onTimePercent: number | null;
  /** Orders that shipped but were never given a promised date. They cannot be
   *  judged, so they are named rather than quietly folded into the rate. */
  noPromisedDate: number;
  averageDaysLate: number | null;
  note: string;
}

export async function deliveryReport(since: Date): Promise<DeliveryReport> {
  const orders = await prisma.order.findMany({
    where: { confirmedAt: { gte: since }, status: { in: ['SHIPPED', 'DELIVERED', 'COMPLETED'] } },
    select: { promisedAt: true, shipments: { select: { dispatchedAt: true } } },
    take: MAX_ROWS,
  });

  let measured = 0;
  let onTime = 0;
  let lateDays = 0;
  let noPromise = 0;

  for (const order of orders) {
    /* When it actually went: the first consignment that left. */
    const dispatches = order.shipments
      .map((s) => s.dispatchedAt)
      .filter((d): d is Date => d instanceof Date);
    const wentAt = dispatches.length ? new Date(Math.min(...dispatches.map((d) => d.getTime()))) : null;

    if (!order.promisedAt || !wentAt) {
      noPromise += 1;
      continue;
    }

    measured += 1;
    const days = Math.round((wentAt.getTime() - order.promisedAt.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 0) onTime += 1;
    else lateDays += days;
  }

  const late = measured - onTime;

  return {
    measured,
    onTime,
    late,
    onTimePercent: measured > 0 ? Math.round((onTime / measured) * 1000) / 10 : null,
    noPromisedDate: noPromise,
    averageDaysLate: late > 0 ? Math.round((lateDays / late) * 10) / 10 : null,
    note: measured === 0
      ? 'Nothing in this period has both a promised date and a dispatch to compare it against, so on-time delivery cannot be measured.'
      : noPromise > 0
        ? `${noPromise} shipped order${noPromise === 1 ? ' has' : 's have'} no promised date or no recorded dispatch and could not be judged. They are not in the rate.`
        : 'Measured against the first consignment to leave.',
  };
}

/* ------------------------------------------------------------ production -- */

export interface ProductionReport {
  months: Bucket[];
  good: number[];
  rejected: number[];
  rejectRate: number[];
  totalGood: number;
  totalRejected: number;
  overallRejectRate: number | null;
  note: string;
}

export async function productionByMonth(months: number): Promise<ProductionReport> {
  const buckets = monthsBack(months);

  const rows = await prisma.productionOutput.findMany({
    where: { recordedAt: { gte: startOf(buckets) } },
    select: { recordedAt: true, quantityGood: true, quantityRejected: true },
    take: MAX_ROWS,
  });

  const index = new Map(buckets.map((b, i) => [b.month, i]));
  const good = new Array<number>(buckets.length).fill(0);
  const rejected = new Array<number>(buckets.length).fill(0);

  for (const row of rows) {
    const at = index.get(monthOf(row.recordedAt));
    if (at === undefined) continue;
    good[at] = (good[at] ?? 0) + row.quantityGood;
    rejected[at] = (rejected[at] ?? 0) + row.quantityRejected;
  }

  const totalGood = good.reduce((a, b) => a + b, 0);
  const totalRejected = rejected.reduce((a, b) => a + b, 0);
  const made = totalGood + totalRejected;

  return {
    months: buckets,
    good,
    rejected,
    /* Per month, and null-safe: a month that made nothing has a reject rate of
       nothing, not of zero percent. */
    rejectRate: buckets.map((_, i) => {
      const g = good[i] ?? 0;
      const r = rejected[i] ?? 0;
      return g + r > 0 ? Math.round((r / (g + r)) * 1000) / 10 : 0;
    }),
    totalGood,
    totalRejected,
    overallRejectRate: made > 0 ? Math.round((totalRejected / made) * 1000) / 10 : null,
    note: made === 0
      ? 'No production output has been recorded in this period.'
      : 'Counted from what was recorded coming off the line, not from the stage a run was sitting in.',
  };
}

/* --------------------------------------------------------------- quality -- */

export interface QualityReport {
  completed: number;
  passed: number;
  failed: number;
  concessions: number;
  passRatePercent: number | null;
  failingCheckpoints: Array<{ name: string; critical: boolean; failures: number; readings: number; failRate: number }>;
  note: string;
}

export async function qualityReport(since: Date): Promise<QualityReport> {
  const inspections = await prisma.qcInspection.findMany({
    where: { completedAt: { gte: since } },
    select: { result: true, overrideResult: true },
    take: MAX_ROWS,
  });

  const results = await prisma.qcResult.findMany({
    where: { inspection: { completedAt: { gte: since } } },
    select: { passed: true, checkpoint: { select: { name: true, critical: true } } },
    take: MAX_ROWS,
  });

  const passed = inspections.filter((i) => i.result === 'PASSED').length;
  const failed = inspections.filter((i) => i.result === 'FAILED').length;
  /* A concession is a failure that was let through. It is reported alongside
     failures, never folded into the pass rate. */
  const concessions = inspections.filter((i) => i.overrideResult === 'CONCESSION').length;

  const byCheckpoint = new Map<string, { critical: boolean; failures: number; readings: number }>();
  for (const row of results) {
    const entry = byCheckpoint.get(row.checkpoint.name) ?? {
      critical: row.checkpoint.critical,
      failures: 0,
      readings: 0,
    };
    entry.readings += 1;
    if (!row.passed) entry.failures += 1;
    byCheckpoint.set(row.checkpoint.name, entry);
  }

  return {
    completed: inspections.length,
    passed,
    failed,
    concessions,
    passRatePercent: inspections.length > 0
      ? Math.round((passed / inspections.length) * 1000) / 10
      : null,
    failingCheckpoints: [...byCheckpoint.entries()]
      .filter(([, v]) => v.failures > 0)
      .map(([name, v]) => ({
        name,
        critical: v.critical,
        failures: v.failures,
        readings: v.readings,
        failRate: Math.round((v.failures / v.readings) * 1000) / 10,
      }))
      .sort((a, b) => b.failures - a.failures),
    note: inspections.length === 0
      ? 'No inspection was completed in this period.'
      : concessions > 0
        ? `${concessions} failed inspection${concessions === 1 ? ' was' : 's were'} let through on a concession. Those are failures, and are not in the pass rate.`
        : 'A concession would be reported separately; there were none.',
  };
}
