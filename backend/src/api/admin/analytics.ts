/**
 * Reporting endpoints.
 *
 * Everything is computed on request from real rows — there is no reporting
 * table to fall out of date, and no cache to serve a figure that was true an
 * hour ago. The volumes here do not need one.
 *
 * Money comes back per currency and never combined, and every rate says what
 * it could not measure. Both rules live in lib/analytics.ts; this file is the
 * thin layer that parses a window and hands the result over.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection } from '../../middleware/auth';
import {
  deliveryReport,
  pipelineReport,
  productionByMonth,
  qualityReport,
  quotationFunnel,
  salesByMonth,
  topCustomers,
} from '../../lib/analytics';

export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.use(csrfProtection);

/* Twelve months is the default because a year is the window in which a
   manufacturer's seasons show up. Capped at three years so one click cannot
   pull the whole history. */
const windowQuery = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

const since = (months: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
};

adminAnalyticsRouter.get(
  '/sales',
  asyncHandler(async (req, res) => {
    const { months } = windowQuery.parse(req.query);
    const from = since(months);

    const [sales, funnel, customers] = await Promise.all([
      salesByMonth(months),
      quotationFunnel(from),
      topCustomers(from),
    ]);

    res.json({ data: { months, from: from.toISOString().slice(0, 10), sales, funnel, customers } });
  }),
);

adminAnalyticsRouter.get(
  '/pipeline',
  asyncHandler(async (req, res) => {
    const { months } = windowQuery.parse(req.query);
    const from = since(months);
    res.json({ data: { months, from: from.toISOString().slice(0, 10), pipeline: await pipelineReport(from) } });
  }),
);

adminAnalyticsRouter.get(
  '/factory',
  asyncHandler(async (req, res) => {
    const { months } = windowQuery.parse(req.query);
    const from = since(months);

    const [production, quality, delivery] = await Promise.all([
      productionByMonth(months),
      qualityReport(from),
      deliveryReport(from),
    ]);

    res.json({ data: { months, from: from.toISOString().slice(0, 10), production, quality, delivery } });
  }),
);

/* ---------------------------------------------------------------- export -- */

/** One CSV field. Quotes are doubled and the whole field wrapped, so a
 *  customer called "Smith, Jones & Co" does not become two columns. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csv = (rows: unknown[][]): string =>
  /* A leading BOM so Excel opens it as UTF-8 rather than mangling a name with
     an accent in it. */
  `﻿${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;

const exportQuery = windowQuery.extend({
  report: z.enum(['orders', 'production', 'quality']),
});

/**
 * The underlying rows, for somebody who wants them in a spreadsheet.
 *
 * Deliberately the rows rather than the summary: a total in a CSV is a number
 * nobody can check, and the point of an export is that the recipient can do
 * their own arithmetic.
 */
adminAnalyticsRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { months, report } = exportQuery.parse(req.query);
    const from = since(months);

    let rows: unknown[][];
    if (report === 'orders') {
      const orders = await prisma.order.findMany({
        where: { confirmedAt: { gte: from } },
        orderBy: { confirmedAt: 'asc' },
        select: {
          number: true, status: true, currency: true, total: true, confirmedAt: true,
          promisedAt: true, poNumber: true,
          company: { select: { name: true, country: true } },
          payments: { select: { amount: true } },
        },
        take: 5000,
      });
      rows = [
        ['Order', 'Customer', 'Country', 'Their PO', 'Status', 'Currency', 'Total', 'Paid', 'Outstanding', 'Confirmed', 'Promised'],
        ...orders.map((o) => {
          const total = Number(o.total.toString());
          const paid = o.payments.reduce((sum, p) => sum + Number(p.amount.toString()), 0);
          return [
            o.number, o.company?.name, o.company?.country, o.poNumber, o.status, o.currency,
            total.toFixed(2), paid.toFixed(2), (Math.round((total - paid) * 100) / 100).toFixed(2),
            o.confirmedAt, o.promisedAt,
          ];
        }),
      ];
    } else if (report === 'production') {
      const outputs = await prisma.productionOutput.findMany({
        where: { recordedAt: { gte: from } },
        orderBy: { recordedAt: 'asc' },
        select: {
          recordedAt: true, quantityGood: true, quantityRejected: true, note: true,
          stage: { select: { name: true } },
          run: { select: { reference: true, title: true, order: { select: { number: true } } } },
        },
        take: 5000,
      });
      rows = [
        ['Recorded', 'Run', 'What', 'Order', 'Stage', 'Passed', 'Rejected', 'Note'],
        ...outputs.map((o) => [
          o.recordedAt, o.run.reference, o.run.title, o.run.order?.number,
          o.stage?.name, o.quantityGood, o.quantityRejected, o.note,
        ]),
      ];
    } else {
      const inspections = await prisma.qcInspection.findMany({
        where: { completedAt: { gte: from } },
        orderBy: { completedAt: 'asc' },
        select: {
          reference: true, result: true, overrideResult: true, overrideReason: true,
          sampleSize: true, quantityPassed: true, quantityFailed: true, completedAt: true,
          run: { select: { reference: true } },
          order: { select: { number: true } },
        },
        take: 5000,
      });
      rows = [
        ['Inspection', 'Run', 'Order', 'Completed', 'Result', 'Overruled to', 'Reason', 'Sample', 'Passed', 'Failed'],
        ...inspections.map((i) => [
          i.reference, i.run?.reference, i.order?.number, i.completedAt,
          i.result, i.overrideResult, i.overrideReason,
          i.sampleSize, i.quantityPassed, i.quantityFailed,
        ]),
      ];
    }

    const filename = `win-wears-${report}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv(rows));
  }),
);
