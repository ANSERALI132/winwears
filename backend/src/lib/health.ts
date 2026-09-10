/**
 * System health.
 *
 * Two different questions, answered separately.
 *
 * Is anything broken *now* — can the database be reached, can a file be
 * written, is the assistant switched on. These are cheap and are the ones a
 * monitor asks.
 *
 * And is anything *wrong with the data* — stock showing less than nothing, a
 * document whose file has gone, a failed inspection nobody has decided about.
 * Those are not outages; they are the quiet inconsistencies that a system of
 * this size accumulates, and nothing else in the admin goes looking for them.
 *
 * Every check names what it looked at and says so in a sentence. A red light
 * with no explanation is worse than no light at all.
 */
import { performance } from 'node:perf_hooks';
import { prisma } from '../db';
import { env } from '../env';
import { aiProvider } from '../ai';
import { mailConfigured } from './mailer';
import { whatsappConfigured } from './whatsappSend';
import { checkWritable, documentExists } from './documents';
import { levelOf } from './stock';

export type Level = 'ok' | 'warn' | 'fail' | 'off';

export interface Check {
  id: string;
  label: string;
  level: Level;
  /** One sentence a person can act on. */
  detail: string;
  /** Where to go and look, when there is somewhere. */
  href?: string;
  /** How long the check itself took, for the ones that touch the database. */
  ms?: number;
}

const ms = (started: number): number => Math.round(performance.now() - started);

/* ------------------------------------------------------------- services -- */

async function database(): Promise<Check> {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const took = ms(started);
    return {
      id: 'database',
      label: 'Database',
      /* A local Postgres answering a trivial query should be immediate.
         Anything approaching a second means something is wrong with the
         connection, not with the query. */
      level: took > 1000 ? 'warn' : 'ok',
      detail: took > 1000
        ? `Answering, but slowly — ${took}ms for a trivial query.`
        : `Answering in ${took}ms.`,
      ms: took,
    };
  } catch (err) {
    return {
      id: 'database',
      label: 'Database',
      level: 'fail',
      detail: err instanceof Error ? err.message : 'Not reachable.',
      ms: ms(started),
    };
  }
}

async function storage(): Promise<Check> {
  const started = performance.now();
  const result = await checkWritable();
  return {
    id: 'storage',
    label: 'Document storage',
    level: result.ok ? 'ok' : 'fail',
    detail: result.ok
      ? 'A file can be written, read back and removed.'
      : `Cannot be written to: ${result.error}. Attaching a document would fail.`,
    ms: ms(started),
  };
}

function assistant(): Check {
  return {
    id: 'assistant',
    label: 'AI assistant',
    level: aiProvider.configured ? 'ok' : 'off',
    detail: aiProvider.configured
      ? `Configured, using ${aiProvider.model}.`
      : 'No API key, so the widget never appears and the copilot is switched off. Everything else works without it.',
    href: '#/ai/settings',
  };
}

function email(): Check {
  return {
    id: 'email',
    label: 'Notification email',
    level: mailConfigured() ? 'ok' : 'off',
    detail: mailConfigured()
      ? 'Configured. Notifications also go out by email.'
      : 'No mail server, so notifications only appear in the admin.',
    href: '#/notifications/settings',
  };
}

function whatsapp(): Check {
  return {
    id: 'whatsapp',
    label: 'WhatsApp notifications',
    level: whatsappConfigured() ? 'ok' : 'off',
    detail: whatsappConfigured()
      ? 'Configured. Notifications also go to the business number.'
      : 'Not configured, so nothing is sent to WhatsApp.',
    href: '#/notifications/settings',
  };
}

async function automation(): Promise<Check> {
  if (env.AUTOMATION_SWEEP_MINUTES <= 0) {
    return {
      id: 'automation',
      label: 'Automation sweep',
      level: 'off',
      detail: 'Switched off, so rules only run when somebody runs them by hand.',
      href: '#/automation',
    };
  }

  const [active, lastRun] = await Promise.all([
    prisma.automationRule.count({ where: { active: true } }),
    prisma.automationRun.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  if (active === 0) {
    return {
      id: 'automation',
      label: 'Automation sweep',
      level: 'ok',
      detail: `Running every ${env.AUTOMATION_SWEEP_MINUTES} minutes, but no rules are switched on yet.`,
      href: '#/automation',
    };
  }

  /* Two windows late is a sweep that has stopped, not one that is busy. */
  const overdue = lastRun
    ? Date.now() - lastRun.createdAt.getTime() > env.AUTOMATION_SWEEP_MINUTES * 2 * 60 * 1000
    : false;

  return {
    id: 'automation',
    label: 'Automation sweep',
    level: overdue ? 'warn' : 'ok',
    detail: overdue
      ? `${active} rules are on, but nothing has run since ${lastRun?.createdAt.toISOString().slice(0, 16).replace('T', ' ')}. The sweep may have stopped — restarting the server starts it again.`
      : `${active} rules, checked every ${env.AUTOMATION_SWEEP_MINUTES} minutes.`,
    href: '#/automation',
  };
}

async function webhooks(): Promise<Check> {
  const [total, failing, stuck] = await Promise.all([
    prisma.webhook.count({ where: { active: true } }),
    prisma.webhook.count({ where: { active: true, failures: { gte: 3 } } }),
    prisma.webhookDelivery.count({ where: { settledAt: null, attempts: { gte: 1 } } }),
  ]);

  if (total === 0) {
    return { id: 'webhooks', label: 'Webhooks', level: 'off', detail: 'None set up.', href: '#/integrations' };
  }
  if (failing > 0) {
    return {
      id: 'webhooks',
      label: 'Webhooks',
      level: 'fail',
      detail: `${failing} of ${total} have failed three or more times in a row. Whatever is on the other end is not answering.`,
      href: '#/integrations',
    };
  }
  return {
    id: 'webhooks',
    label: 'Webhooks',
    level: stuck > 0 ? 'warn' : 'ok',
    detail: stuck > 0
      ? `${total} active. ${stuck} deliveries are still being retried.`
      : `${total} active, all delivering.`,
    href: '#/integrations',
  };
}

/* ------------------------------------------------------------ integrity -- */

/**
 * Stock that says there is less than nothing on the shelf.
 *
 * Not a shortage — an impossibility. Something was issued that was never
 * recorded as received, and the count needs correcting rather than ordering
 * against.
 */
async function impossibleStock(): Promise<Check> {
  const items = await prisma.stockItem.findMany({
    where: { active: true },
    select: { id: true, sku: true, movements: { select: { quantity: true } } },
  });
  const wrong = items.filter((i) => levelOf(i.movements, null).negative);

  return {
    id: 'stock-negative',
    label: 'Stock counts',
    level: wrong.length ? 'warn' : 'ok',
    detail: wrong.length
      ? `${wrong.length} item${wrong.length === 1 ? '' : 's'} show less than nothing on hand (${wrong.slice(0, 3).map((i) => i.sku).join(', ')}${wrong.length > 3 ? '…' : ''}). Something went out that never went in.`
      : items.length
        ? `All ${items.length} items add up.`
        : 'Nothing is being tracked yet.',
    href: '#/stock',
  };
}

/** Documents whose file has gone from storage. The row promises a download
 *  that would 404. */
async function orphanedDocuments(): Promise<Check> {
  const rows = await prisma.attachment.findMany({ select: { id: true, filename: true, storageKey: true }, take: 500 });
  const missing: string[] = [];
  for (const row of rows) {
    if (!(await documentExists(row.storageKey))) missing.push(row.filename);
  }

  return {
    id: 'documents-missing',
    label: 'Attached documents',
    level: missing.length ? 'warn' : 'ok',
    detail: missing.length
      ? `${missing.length} of ${rows.length} have no file behind them (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}). Downloading one would fail.`
      : rows.length
        ? `All ${rows.length} have their file.`
        : 'Nothing attached yet.',
    href: '#/documents',
  };
}

/** A failed inspection nobody has passed or conceded. The batch is in limbo
 *  until somebody decides. */
async function undecidedFailures(): Promise<Check> {
  const count = await prisma.qcInspection.count({
    where: { result: 'FAILED', overrideResult: null, NOT: { completedAt: null } },
  });
  return {
    id: 'qc-undecided',
    label: 'Failed inspections',
    level: count ? 'warn' : 'ok',
    detail: count
      ? `${count} failed and nobody has decided what happens to the batch.`
      : 'None waiting on a decision.',
    href: '#/qc?result=FAILED',
  };
}

/** A sent quotation with no lines, or an order with none. Both are documents
 *  a customer could be holding that say nothing. */
async function emptyDocuments(): Promise<Check> {
  const [quotations, orders] = await Promise.all([
    prisma.quotation.count({ where: { status: { not: 'DRAFT' }, items: { none: {} } } }),
    prisma.order.count({ where: { status: { notIn: ['CANCELLED'] }, items: { none: {} } } }),
  ]);
  const total = quotations + orders;

  return {
    id: 'empty-documents',
    label: 'Priced documents',
    level: total ? 'warn' : 'ok',
    detail: total
      ? `${quotations} sent quotations and ${orders} orders have no lines on them.`
      : 'Every quotation and order has lines.',
    href: '#/quotations',
  };
}

/** Published products with no photograph. They render as an empty card on the
 *  public site, which is the one integrity problem a customer sees. */
async function productsWithoutImages(): Promise<Check> {
  const count = await prisma.product.count({
    where: { status: 'PUBLISHED', deletedAt: null, images: { none: {} } },
  });
  return {
    id: 'products-no-image',
    label: 'Published products',
    level: count ? 'warn' : 'ok',
    detail: count
      ? `${count} are live with no photograph, and show as an empty card on the site.`
      : 'All published products have a photograph.',
    href: '#/products?status=PUBLISHED',
  };
}

/* --------------------------------------------------------------- report -- */

export interface HealthReport {
  level: Level;
  checkedAt: string;
  services: Check[];
  integrity: Check[];
  environment: Record<string, string | number>;
}

/** The worst thing in the list. `off` is not a fault — it is a module nobody
 *  has switched on, which is a choice rather than a problem. */
function worst(checks: Check[]): Level {
  if (checks.some((c) => c.level === 'fail')) return 'fail';
  if (checks.some((c) => c.level === 'warn')) return 'warn';
  return 'ok';
}

export async function runHealthChecks(): Promise<HealthReport> {
  const [db, store, sweep, hooks, stock, docs, qc, empty, images] = await Promise.all([
    database(),
    storage(),
    automation(),
    webhooks(),
    impossibleStock(),
    orphanedDocuments(),
    undecidedFailures(),
    emptyDocuments(),
    productsWithoutImages(),
  ]);

  const services = [db, store, assistant(), email(), whatsapp(), sweep, hooks];
  const integrity = [stock, docs, qc, empty, images];

  return {
    level: worst([...services, ...integrity]),
    checkedAt: new Date().toISOString(),
    services,
    integrity,
    environment: {
      node: process.version,
      mode: env.NODE_ENV,
      /* Whole minutes: a restart an hour ago matters, ninety seconds of it
         does not. */
      uptimeMinutes: Math.floor(process.uptime() / 60),
      storageProvider: env.STORAGE_PROVIDER,
    },
  };
}

/**
 * The cheap version, for an uptime monitor.
 *
 * Deliberately says almost nothing: it is unauthenticated, so anything it
 * reports is public. Whether the database answers is the whole of it.
 */
export async function livenessCheck(): Promise<{ ok: boolean }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
