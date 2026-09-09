/**
 * The automation engine.
 *
 * A rule watches for one situation and puts it in front of somebody. What it
 * can produce is a task, an owner or a follow-up date — never an outward
 * action and never a destructive one. Nothing here emails a customer, changes
 * a price, cancels an order or moves stock: those are decisions a person
 * makes, and an automation that quietly took one would be discovered by the
 * customer rather than by us.
 *
 * Every trigger is a query written here, in TypeScript, against the same
 * libraries the screens use. There is no condition language, because a
 * general rule engine is powerful and impossible to validate, while a fixed
 * list of situations this business actually has can be checked before it ever
 * runs.
 */
import type { AutomationAction, AutomationRule, AutomationTrigger, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { levelOf } from './stock';
import { notify } from './notify';

/** One thing a rule matched: what it is, where to look at it, and what to
 *  call the task if one is raised. */
export interface Match {
  entity: string;
  entityId: string;
  label: string;
  href: string;
  /** Only set for triggers whose subject is an opportunity — those are the
   *  only ones an owner or a follow-up date can be applied to. */
  leadId?: string;
  rfqId?: string;
}

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/* --------------------------------------------------------------- triggers -- */

/**
 * What each trigger means, in words, and what its threshold counts.
 *
 * Held here rather than on the screen so the description and the query cannot
 * drift apart — somebody reading "no activity for N days" is reading the same
 * sentence the code implements.
 */
export const TRIGGERS: Record<AutomationTrigger, { title: string; thresholdMeans: string; subject: string }> = {
  RFQ_UNANSWERED: {
    title: 'A quote request nobody has answered',
    thresholdMeans: 'days since it arrived',
    subject: 'quote request',
  },
  LEAD_IDLE: {
    title: 'An open opportunity going quiet',
    thresholdMeans: 'days without activity',
    subject: 'opportunity',
  },
  ORDER_LATE: {
    title: 'An order past the date we promised',
    thresholdMeans: 'days past the promised date',
    subject: 'order',
  },
  ORDER_UNPAID: {
    title: 'Money outstanding on a finished order',
    thresholdMeans: 'days since it was confirmed',
    subject: 'order',
  },
  RUN_LATE: {
    title: 'A production run past its date',
    thresholdMeans: 'days past the due date',
    subject: 'production run',
  },
  STOCK_LOW: {
    title: 'Stock at or below its reorder level',
    thresholdMeans: 'not used — an item is low or it is not',
    subject: 'stock item',
  },
  SHIPMENT_OVERDUE: {
    title: 'A consignment that should have arrived',
    thresholdMeans: 'days past the expected date',
    subject: 'shipment',
  },
  QC_FAILED: {
    title: 'A failed inspection nobody has decided about',
    thresholdMeans: 'days since it was completed',
    subject: 'inspection',
  },
};

/** Which actions make sense for which trigger. An owner or a follow-up date
 *  can only be set on something that has one. */
export function actionsFor(trigger: AutomationTrigger): AutomationAction[] {
  if (trigger === 'LEAD_IDLE') return ['CREATE_TASK', 'ASSIGN_OWNER', 'SET_FOLLOW_UP'];
  if (trigger === 'RFQ_UNANSWERED') return ['CREATE_TASK', 'ASSIGN_OWNER'];
  return ['CREATE_TASK'];
}

export function actionAllowed(trigger: AutomationTrigger, action: AutomationAction): boolean {
  return actionsFor(trigger).includes(action);
}

/**
 * Finds everything a rule currently matches.
 *
 * Capped, because a rule that matches four hundred things on its first run
 * should raise a manageable list and say there are more, not bury somebody.
 */
export async function findMatches(rule: Pick<AutomationRule, 'trigger' | 'thresholdDays'>, limit = 50): Promise<Match[]> {
  const cutoff = daysAgo(Math.max(0, rule.thresholdDays));
  const now = new Date();

  switch (rule.trigger) {
    case 'RFQ_UNANSWERED': {
      const rows = await prisma.quoteRequest.findMany({
        where: { status: 'NEW', createdAt: { lt: cutoff } },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, reference: true, name: true, company: true },
      });
      return rows.map((r) => ({
        entity: 'quote request',
        entityId: r.id,
        label: `${r.reference ?? 'Quote request'} — ${r.company || r.name}`,
        href: `#/rfq/${r.id}`,
        rfqId: r.id,
      }));
    }

    case 'LEAD_IDLE': {
      const rows = await prisma.lead.findMany({
        where: {
          closedAt: null,
          /* Never touched counts as idle: a lead created a month ago that
             nobody has done anything with is exactly the case worth raising. */
          OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null, createdAt: { lt: cutoff } }],
        },
        orderBy: { lastActivityAt: { sort: 'asc', nulls: 'first' } },
        take: limit,
        select: { id: true, reference: true, title: true, company: { select: { name: true } } },
      });
      return rows.map((l) => ({
        entity: 'opportunity',
        entityId: l.id,
        label: `${l.reference ?? l.title}${l.company ? ` — ${l.company.name}` : ''}`,
        href: `#/crm/leads/${l.id}`,
        leadId: l.id,
      }));
    }

    case 'ORDER_LATE': {
      const rows = await prisma.order.findMany({
        where: {
          promisedAt: { lt: cutoff },
          status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_TO_SHIP', 'ON_HOLD'] },
        },
        orderBy: { promisedAt: 'asc' },
        take: limit,
        select: { id: true, number: true, company: { select: { name: true } } },
      });
      return rows.map((o) => ({
        entity: 'order',
        entityId: o.id,
        label: `${o.number}${o.company ? ` — ${o.company.name}` : ''}`,
        href: `#/orders/${o.id}`,
      }));
    }

    case 'ORDER_UNPAID': {
      /* The balance is the sum of a related table, so it is worked out here
         rather than in the query — the same reason the orders list does it
         this way. */
      const rows = await prisma.order.findMany({
        where: { status: { in: ['DELIVERED', 'COMPLETED'] }, confirmedAt: { lt: cutoff } },
        orderBy: { confirmedAt: 'asc' },
        take: 200,
        select: {
          id: true, number: true, total: true, currency: true,
          company: { select: { name: true } },
          payments: { select: { amount: true } },
        },
      });
      return rows
        .filter((o) => {
          const paid = o.payments.reduce((sum, p) => sum + Math.round(Number(p.amount.toString()) * 100), 0);
          return Math.round(Number(o.total.toString()) * 100) - paid > 0;
        })
        .slice(0, limit)
        .map((o) => ({
          entity: 'order',
          entityId: o.id,
          label: `${o.number}${o.company ? ` — ${o.company.name}` : ''}`,
          href: `#/orders/${o.id}`,
        }));
    }

    case 'RUN_LATE': {
      const rows = await prisma.productionRun.findMany({
        where: { plannedEnd: { lt: cutoff }, status: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] } },
        orderBy: { plannedEnd: 'asc' },
        take: limit,
        select: { id: true, reference: true, title: true },
      });
      return rows.map((r) => ({
        entity: 'production run',
        entityId: r.id,
        label: `${r.reference} — ${r.title}`,
        href: `#/production/${r.id}`,
      }));
    }

    case 'STOCK_LOW': {
      const items = await prisma.stockItem.findMany({
        where: { active: true, NOT: { reorderLevel: null } },
        take: 400,
        select: { id: true, name: true, sku: true, reorderLevel: true, movements: { select: { quantity: true } } },
      });
      return items
        .filter((i) => levelOf(i.movements, i.reorderLevel).low)
        .slice(0, limit)
        .map((i) => ({
          entity: 'stock item',
          entityId: i.id,
          label: `${i.sku} — ${i.name}`,
          href: `#/stock/${i.id}`,
        }));
    }

    case 'SHIPMENT_OVERDUE': {
      const rows = await prisma.shipment.findMany({
        where: { expectedAt: { lt: cutoff }, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        orderBy: { expectedAt: 'asc' },
        take: limit,
        select: { id: true, reference: true, order: { select: { number: true } } },
      });
      return rows.map((s) => ({
        entity: 'shipment',
        entityId: s.id,
        label: `${s.reference} — ${s.order.number}`,
        href: `#/shipments/${s.id}`,
      }));
    }

    case 'QC_FAILED': {
      const rows = await prisma.qcInspection.findMany({
        where: {
          result: 'FAILED',
          overrideResult: null,
          NOT: { completedAt: null },
          completedAt: { lt: cutoff },
        },
        orderBy: { completedAt: 'asc' },
        take: limit,
        select: { id: true, reference: true, run: { select: { title: true } } },
      });
      return rows.map((i) => ({
        entity: 'inspection',
        entityId: i.id,
        label: `${i.reference}${i.run ? ` — ${i.run.title}` : ''}`,
        href: `#/qc/${i.id}`,
      }));
    }

    default:
      /* Exhaustive above; a new trigger with no query returns nothing rather
         than throwing on a sweep that runs unattended. */
      return [];
  }
}

/* ----------------------------------------------------------------- acting -- */

export interface RuleOutcome {
  matched: number;
  acted: number;
  skipped: number;
  ms: number;
  error?: string;
}

/**
 * Runs one rule.
 *
 * Never throws: a sweep covers every rule, and one broken query must not stop
 * the rest. The failure is recorded against the rule so somebody can see
 * which one is not working.
 */
export async function runRule(rule: AutomationRule): Promise<RuleOutcome> {
  const started = Date.now();

  try {
    const matches = await findMatches(rule);
    let acted = 0;
    let skipped = 0;

    for (const match of matches) {
      const did = await act(rule, match);
      if (did) acted += 1;
      else skipped += 1;
    }

    const outcome: RuleOutcome = { matched: matches.length, acted, skipped, ms: Date.now() - started };

    await prisma.$transaction([
      prisma.automationRun.create({
        data: { ruleId: rule.id, matched: outcome.matched, acted, skipped, ms: outcome.ms },
      }),
      prisma.automationRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date(), ...(acted ? { firedCount: { increment: acted } } : {}) },
      }),
    ]);

    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown failure';
    console.error(`Automation rule "${rule.name}" failed:`, err);
    const ms = Date.now() - started;
    await prisma.automationRun.create({ data: { ruleId: rule.id, error: message.slice(0, 500), ms } });
    await prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date() } });
    return { matched: 0, acted: 0, skipped: 0, ms, error: message };
  }
}

/** Does the rule's action for one match. Returns false when there was nothing
 *  to do — already raised, already owned, already scheduled. */
async function act(rule: AutomationRule, match: Match): Promise<boolean> {
  if (rule.action === 'CREATE_TASK') return raiseTask(rule, match);

  if (rule.action === 'ASSIGN_OWNER') {
    if (!rule.assigneeId) return false;
    if (match.leadId) {
      /* Only an unowned one. A rule must not take a lead off the person who
         is already working it. */
      const updated = await prisma.lead.updateMany({
        where: { id: match.leadId, ownerId: null },
        data: { ownerId: rule.assigneeId, lastActivityAt: new Date() },
      });
      return updated.count > 0;
    }
    if (match.rfqId) {
      const updated = await prisma.quoteRequest.updateMany({
        where: { id: match.rfqId, assignedToId: null },
        data: { assignedToId: rule.assigneeId },
      });
      return updated.count > 0;
    }
    return false;
  }

  if (rule.action === 'SET_FOLLOW_UP') {
    if (!match.leadId) return false;
    const due = new Date(Date.now() + Math.max(0, rule.taskDueDays ?? 1) * 24 * 60 * 60 * 1000);
    /* Only where none is set. Overwriting a date somebody chose is the rule
       arguing with a person, and the person wins. */
    const updated = await prisma.lead.updateMany({
      where: { id: match.leadId, nextFollowUpAt: null },
      data: { nextFollowUpAt: due },
    });
    return updated.count > 0;
  }

  return false;
}

/**
 * Raises a task, unless this rule already has an open one for this thing.
 *
 * The guard is the unique index on (ruleId, openKey), not a check followed by
 * an insert: a sweep and a hand-triggered run happening together would both
 * pass a check and both insert. A duplicate here is caught by the database.
 */
async function raiseTask(rule: AutomationRule, match: Match): Promise<boolean> {
  const title = (rule.taskTitle?.trim() || TRIGGERS[rule.trigger].title).slice(0, 200);

  try {
    const task = await prisma.task.create({
      data: {
        title: `${title}: ${match.label}`.slice(0, 250),
        detail: `Raised by the rule "${rule.name}".`,
        priority: rule.taskPriority,
        dueAt: rule.taskDueDays == null
          ? null
          : new Date(Date.now() + Math.max(0, rule.taskDueDays) * 24 * 60 * 60 * 1000),
        assignedToId: rule.assigneeId,
        entity: match.entity,
        entityId: match.entityId,
        href: match.href,
        ruleId: rule.id,
        openKey: match.entityId,
      },
    });

    /* Only the person it landed on. An unassigned task is on the list for
       whoever picks it up, and telling everybody about it would make the bell
       useless within a week. */
    if (rule.assigneeId) {
      await notify({
        kind: 'TASK_ASSIGNED',
        title: task.title,
        body: `Raised by the rule "${rule.name}".`,
        href: '#/tasks?mine=1',
        entity: 'task',
        entityId: task.id,
        userIds: [rule.assigneeId],
      });
    }

    return true;
  } catch (err) {
    /* P2002 on (ruleId, openKey) means the task is already open. That is the
       normal case on every sweep after the first, not an error. */
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
}

/** Runs every active rule. Used by the sweep and by the Run now button. */
export async function runAllRules(): Promise<{ rules: number; acted: number; matched: number }> {
  const rules = await prisma.automationRule.findMany({ where: { active: true } });

  let acted = 0;
  let matched = 0;
  for (const rule of rules) {
    const outcome = await runRule(rule);
    acted += outcome.acted;
    matched += outcome.matched;
  }

  return { rules: rules.length, acted, matched };
}
