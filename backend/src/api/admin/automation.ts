/**
 * Automation rules and the tasks they raise.
 *
 * A rule watches for one situation and puts it in front of somebody. It can
 * raise a task, give an unowned enquiry an owner, or set a follow-up date —
 * and nothing else. Nothing here emails a customer, changes a price, cancels
 * an order or moves stock.
 *
 * Tasks also exist on their own: somebody writing themselves a note is the
 * same shape as a rule writing it for them, and one list is better than two.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { badRequest, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { actionAllowed, actionsFor, findMatches, runRule, TRIGGERS } from '../../lib/automation';
import { env } from '../../env';
import { notify } from '../../lib/notify';
import {
  ruleCreateSchema,
  ruleListQuery,
  ruleUpdateSchema,
  taskCreateSchema,
  taskListQuery,
  taskStatusSchema,
  taskUpdateSchema,
} from '../../validation/automation';

export const adminAutomationRouter = Router();

adminAutomationRouter.use(csrfProtection);

/**
 * A task link is rendered as an href, so it is checked before it is stored —
 * the same hazard as a tracking link. Only in-dashboard routes: a task is
 * somewhere to go inside this admin, never an outside destination.
 */
function safeTaskHref(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return /^#\/[A-Za-z0-9/_\-?=&.]*$/.test(trimmed) ? trimmed : null;
}

/* ---------------------------------------------------------------- rules -- */

/** What a rule can be built from, so the screen offers only combinations that
 *  work rather than letting somebody save one the engine will ignore. */
adminAutomationRouter.get(
  '/triggers',
  asyncHandler(async (_req, res) => {
    res.json({
      data: {
        triggers: Object.entries(TRIGGERS).map(([value, meta]) => ({
          value,
          title: meta.title,
          thresholdMeans: meta.thresholdMeans,
          subject: meta.subject,
          actions: actionsFor(value as keyof typeof TRIGGERS),
        })),
        sweepMinutes: env.AUTOMATION_SWEEP_MINUTES,
      },
    });
  }),
);

const RULE_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  runs: { orderBy: { createdAt: 'desc' }, take: 10 },
  _count: { select: { tasks: true } },
} satisfies Prisma.AutomationRuleInclude;

adminAutomationRouter.get(
  '/rules',
  asyncHandler(async (req, res) => {
    const q = ruleListQuery.parse(req.query);

    const where: Prisma.AutomationRuleWhereInput = {
      ...(q.trigger ? { trigger: q.trigger } : {}),
      ...(q.active ? { active: q.active === '1' || q.active === 'true' } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.automationRule.count({ where }),
      prisma.automationRule.findMany({
        where,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: RULE_INCLUDE,
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminAutomationRouter.get(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const rule = await prisma.automationRule.findUnique({
      where: { id: String(req.params.id) },
      include: RULE_INCLUDE,
    });
    if (!rule) throw notFound('That rule no longer exists.');
    res.json({ data: rule });
  }),
);

/**
 * What a rule matches right now, without doing anything about it.
 *
 * The answer to "what will this do if I switch it on", which is the question
 * anybody sensible asks before switching on something that acts by itself.
 */
adminAutomationRouter.post(
  '/rules/preview',
  asyncHandler(async (req, res) => {
    const input = ruleCreateSchema.parse(req.body);
    const matches = await findMatches({ trigger: input.trigger, thresholdDays: input.thresholdDays }, 25);
    res.json({
      data: {
        matches,
        found: matches.length,
        wouldAct: input.action,
        note: matches.length === 0
          ? 'Nothing matches this rule at the moment. That is not a fault — it means the situation is not happening today.'
          : undefined,
      },
    });
  }),
);

adminAutomationRouter.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const input = ruleCreateSchema.parse(req.body);

    if (!actionAllowed(input.trigger, input.action)) {
      throw badRequest(
        `A ${TRIGGERS[input.trigger].subject} has no owner or follow-up date to set. That trigger can only raise a task.`,
      );
    }
    if (input.action !== 'CREATE_TASK' && !input.assigneeId && input.action === 'ASSIGN_OWNER') {
      throw badRequest('Choose who unowned work should be assigned to.');
    }

    const rule = await prisma.automationRule.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        trigger: input.trigger,
        action: input.action,
        thresholdDays: input.thresholdDays,
        taskTitle: input.taskTitle ?? null,
        taskPriority: input.taskPriority,
        taskDueDays: input.taskDueDays ?? null,
        assigneeId: input.assigneeId ?? null,
        active: input.active,
        createdById: req.admin?.id ?? null,
      },
      include: RULE_INCLUDE,
    });

    await log({ adminId: req.admin?.id, action: 'created', entity: 'automation rule', entityId: rule.id, summary: rule.name });
    res.status(201).json({ data: rule });
  }),
);

adminAutomationRouter.put(
  '/rules/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = ruleUpdateSchema.parse(req.body);

    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) throw notFound('That rule no longer exists.');

    const trigger = input.trigger ?? existing.trigger;
    const action = input.action ?? existing.action;
    if (!actionAllowed(trigger, action)) {
      throw badRequest(
        `A ${TRIGGERS[trigger].subject} has no owner or follow-up date to set. That trigger can only raise a task.`,
      );
    }

    const rule = await prisma.automationRule.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.trigger ? { trigger: input.trigger } : {}),
        ...(input.action ? { action: input.action } : {}),
        ...(input.thresholdDays !== undefined ? { thresholdDays: input.thresholdDays } : {}),
        ...(input.taskTitle !== undefined ? { taskTitle: input.taskTitle || null } : {}),
        ...(input.taskPriority ? { taskPriority: input.taskPriority } : {}),
        ...(input.taskDueDays !== undefined ? { taskDueDays: input.taskDueDays } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId || null } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: RULE_INCLUDE,
    });

    await log({ adminId: req.admin?.id, action: 'updated', entity: 'automation rule', entityId: id, summary: rule.name });
    res.json({ data: rule });
  }),
);

/** Runs one rule now. The same code the sweep runs, so what happens here is
 *  what happens unattended. */
adminAutomationRouter.post(
  '/rules/:id/run',
  asyncHandler(async (req, res) => {
    const rule = await prisma.automationRule.findUnique({ where: { id: String(req.params.id) } });
    if (!rule) throw notFound('That rule no longer exists.');

    const outcome = await runRule(rule);

    await log({
      adminId: req.admin?.id,
      action: 'status_changed',
      entity: 'automation rule',
      entityId: rule.id,
      summary: `${rule.name} run by hand — ${outcome.acted} raised of ${outcome.matched} matched`,
    });

    const fresh = await prisma.automationRule.findUnique({ where: { id: rule.id }, include: RULE_INCLUDE });
    res.json({ data: { outcome, rule: fresh } });
  }),
);

adminAutomationRouter.delete(
  '/rules/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.automationRule.findUnique({ where: { id }, select: { name: true } });
    if (!existing) throw notFound('That rule no longer exists.');

    /* The tasks it raised survive — they are somebody's work, not the rule's
       property. `onDelete: SetNull` on Task.ruleId is what makes that true,
       and it also releases the open-task guard so a replacement rule can
       raise its own. */
    await prisma.automationRule.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'automation rule', entityId: id, summary: existing.name });
    res.status(204).end();
  }),
);

/* ---------------------------------------------------------------- tasks -- */

const TASK_INCLUDE = {
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  rule: { select: { id: true, name: true, trigger: true } },
} satisfies Prisma.TaskInclude;

adminAutomationRouter.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const q = taskListQuery.parse(req.query);

    const and: Prisma.TaskWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.priority) and.push({ priority: q.priority });
    if (q.mine) and.push({ assignedToId: req.admin?.id ?? '' });
    else if (q.assignedToId) and.push({ assignedToId: q.assignedToId });
    if (q.overdue) and.push({ status: 'OPEN', dueAt: { lt: new Date() } });
    if (q.q) {
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { detail: { contains: q.q, mode: 'insensitive' } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows, openCount] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        /* Most urgent first, then soonest due, then oldest. A task list read
           top to bottom should be in the order somebody would work it. */
        orderBy: [
          { status: 'asc' },
          { priority: 'desc' },
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: TASK_INCLUDE,
      }),
      prisma.task.count({ where: { status: 'OPEN' } }),
    ]);

    res.json({
      data: rows,
      meta: {
        page: q.page, perPage: q.perPage, total,
        totalPages: Math.max(1, Math.ceil(total / q.perPage)),
        open: openCount,
      },
    });
  }),
);

adminAutomationRouter.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const input = taskCreateSchema.parse(req.body);

    let href: string | null = null;
    if (input.href) {
      href = safeTaskHref(input.href);
      if (!href) throw badRequest('A task link has to be a page inside this dashboard, starting with #/.');
    }

    const task = await prisma.task.create({
      data: {
        title: input.title,
        detail: input.detail ?? null,
        priority: input.priority,
        dueAt: input.dueAt ?? null,
        assignedToId: input.assignedToId ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        href,
        createdById: req.admin?.id ?? null,
        /* No rule and no openKey: the guard against duplicates belongs to
           rules. A person writing the same note twice meant to. */
      },
      include: TASK_INCLUDE,
    });

    /* Somebody else's list, not your own: putting a note on your own list and
       being told about it is noise. */
    if (task.assignedToId && task.assignedToId !== req.admin?.id) {
      await notify({
        kind: 'TASK_ASSIGNED',
        title: task.title,
        body: req.admin ? `Assigned by ${req.admin.name}.` : null,
        href: '#/tasks?mine=1',
        entity: 'task',
        entityId: task.id,
        userIds: [task.assignedToId],
      });
    }

    res.status(201).json({ data: task });
  }),
);

adminAutomationRouter.put(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = taskUpdateSchema.parse(req.body);

    const existing = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('That task no longer exists.');

    let href: string | null | undefined;
    if (input.href !== undefined) {
      if (!input.href) href = null;
      else {
        href = safeTaskHref(input.href);
        if (!href) throw badRequest('A task link has to be a page inside this dashboard, starting with #/.');
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.detail !== undefined ? { detail: input.detail || null } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId || null } : {}),
        ...(href !== undefined ? { href } : {}),
      },
      include: TASK_INCLUDE,
    });

    res.json({ data: task });
  }),
);

/**
 * Done, dismissed, or reopened.
 *
 * Closing a task clears its openKey, which is what lets the rule raise the
 * same thing again if the situation comes back — and reopening one has to
 * put the key back, or two open tasks for the same thing become possible.
 */
adminAutomationRouter.patch(
  '/tasks/:id/status',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const { status } = taskStatusSchema.parse(req.body);

    const existing = await prisma.task.findUnique({
      where: { id },
      select: { status: true, ruleId: true, entityId: true },
    });
    if (!existing) throw notFound('That task no longer exists.');

    if (status === 'OPEN' && existing.status !== 'OPEN' && existing.ruleId && existing.entityId) {
      const clash = await prisma.task.findFirst({
        where: { ruleId: existing.ruleId, openKey: existing.entityId, NOT: { id } },
        select: { id: true },
      });
      if (clash) {
        throw badRequest('That rule already has an open task for the same thing. Deal with that one instead of reopening this.');
      }
    }

    const closing = status !== 'OPEN';
    const task = await prisma.task.update({
      where: { id },
      data: {
        status,
        openKey: closing ? null : existing.entityId,
        completedAt: closing ? new Date() : null,
        completedById: closing ? req.admin?.id ?? null : null,
      },
      include: TASK_INCLUDE,
    });

    res.json({ data: task });
  }),
);

adminAutomationRouter.delete(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('That task no longer exists.');

    await prisma.task.delete({ where: { id } });
    res.status(204).end();
  }),
);
