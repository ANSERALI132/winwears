import { z } from 'zod';
import { optionalText, pagination, requiredText } from './common';

export const automationTrigger = z.enum([
  'RFQ_UNANSWERED', 'LEAD_IDLE', 'ORDER_LATE', 'ORDER_UNPAID',
  'RUN_LATE', 'STOCK_LOW', 'SHIPMENT_OVERDUE', 'QC_FAILED',
]);

export const automationAction = z.enum(['CREATE_TASK', 'ASSIGN_OWNER', 'SET_FOLLOW_UP']);
export const taskStatus = z.enum(['OPEN', 'DONE', 'DISMISSED']);
export const taskPriority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const ruleCreateSchema = z.object({
  name: requiredText('A name', 120),
  description: optionalText(500),
  trigger: automationTrigger,
  action: automationAction.default('CREATE_TASK'),
  /* Zero is allowed and means "as soon as it is true" — an inspection that
     failed this morning is worth raising this morning. */
  thresholdDays: z.coerce.number().int().min(0).max(365).default(1),
  taskTitle: optionalText(200),
  taskPriority: taskPriority.default('NORMAL'),
  taskDueDays: z.coerce.number().int().min(0).max(365).nullish(),
  assigneeId: optionalText(64),
  active: z.coerce.boolean().default(true),
});

export const ruleUpdateSchema = ruleCreateSchema.partial();

export const ruleListQuery = pagination.extend({
  trigger: automationTrigger.optional(),
  active: z.enum(['1', '0', 'true', 'false']).optional(),
});

export const taskCreateSchema = z.object({
  title: requiredText('A title', 250),
  detail: z.string().trim().max(4000).optional(),
  priority: taskPriority.default('NORMAL'),
  dueAt: z.coerce.date().optional(),
  assignedToId: optionalText(64),
  entity: optionalText(60),
  entityId: optionalText(64),
  /* An admin route inside this dashboard. Checked in the route rather than
     here so the refusal can say what is wrong with it — and because a task
     link that could be javascript: is the same hazard as a tracking link. */
  href: optionalText(300),
});

export const taskUpdateSchema = taskCreateSchema.partial();

export const taskStatusSchema = z.object({
  status: taskStatus,
});

export const taskListQuery = pagination.extend({
  q: optionalText(200),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  assignedToId: optionalText(64),
  /* Only what is on my own list. The filter somebody uses every morning. */
  mine: z.enum(['1', 'true']).optional(),
  overdue: z.enum(['1', 'true']).optional(),
});
