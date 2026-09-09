/**
 * Admin CRM: companies, the people at them, and the opportunities.
 *
 * Reads are open to any signed-in admin. Deletes are ADMIN-only, because a
 * company deletion unlinks every enquiry attached to it and that is not an
 * editor's decision to make.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';
import { csrfProtection, requireRole } from '../../middleware/auth';
import { conflict, notFound } from '../../lib/errors';
import { log } from '../../lib/audit';
import { slugify } from '../../lib/slug';
import { companyTimeline, createLeadWithReference, moveLeadStage } from '../../lib/crm';
import {
  companyCreateSchema,
  companyListQuery,
  companyUpdateSchema,
  contactCreateSchema,
  contactUpdateSchema,
  leadCreateSchema,
  leadListQuery,
  leadStageMoveSchema,
  leadUpdateSchema,
} from '../../validation/crm';

export const adminCrmRouter = Router();

adminCrmRouter.use(csrfProtection);

/* ---------------------------------------------------------- companies --- */

adminCrmRouter.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const q = companyListQuery.parse(req.query);

    const and: Prisma.CompanyWhereInput[] = [];
    if (q.segment) and.push({ segment: q.segment });
    if (q.country) and.push({ country: { contains: q.country, mode: 'insensitive' } });
    if (q.tag) and.push({ tags: { has: q.tag.toUpperCase() } });
    if (q.q) {
      and.push({
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { country: { contains: q.q, mode: 'insensitive' } },
          { website: { contains: q.q, mode: 'insensitive' } },
          { contacts: { some: { email: { contains: q.q, mode: 'insensitive' } } } },
          { contacts: { some: { name: { contains: q.q, mode: 'insensitive' } } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany({
        where,
        orderBy: [{ lastContactAt: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: {
          _count: { select: { contacts: true, leads: true, quotes: true, messages: true, conversations: true } },
        },
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

adminCrmRouter.get(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        leads: {
          orderBy: { createdAt: 'desc' },
          include: { owner: { select: { name: true } }, product: { select: { productName: true } } },
        },
      },
    });
    if (!company) throw notFound('That company no longer exists.');

    res.json({ data: { ...company, timeline: await companyTimeline(id) } });
  }),
);

adminCrmRouter.post(
  '/companies',
  asyncHandler(async (req, res) => {
    const input = companyCreateSchema.parse(req.body);

    const existing = await prisma.company.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    if (existing) {
      /* Refused rather than silently merged: two companies with the same
         name may be genuinely different, and that is the admin's call. */
      throw conflict(`A company called "${existing.name}" already exists.`, { id: existing.id });
    }

    const base = slugify(input.name) || 'company';
    let slug = base;
    for (let n = 2; await prisma.company.findUnique({ where: { slug }, select: { id: true } }); n += 1) {
      slug = `${base}-${n}`;
    }

    const company = await prisma.company.create({ data: { ...input, slug, tags: input.tags ?? [] } });
    await log({ adminId: req.admin?.id, action: 'created', entity: 'company', entityId: company.id, summary: company.name });
    res.status(201).json({ data: company });
  }),
);

adminCrmRouter.put(
  '/companies/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = companyUpdateSchema.parse(req.body);
    const existing = await prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('That company no longer exists.');

    const company = await prisma.company.update({ where: { id }, data: input });
    await log({ adminId: req.admin?.id, action: 'updated', entity: 'company', entityId: id, summary: company.name });
    res.json({ data: company });
  }),
);

adminCrmRouter.delete(
  '/companies/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.company.findUnique({
      where: { id },
      select: { name: true, _count: { select: { quotes: true, messages: true, conversations: true } } },
    });
    if (!existing) throw notFound('That company no longer exists.');

    /* Contacts cascade; enquiries are unlinked and kept. A quote request is
       a business record in its own right and outlives the account it was
       filed against. */
    await prisma.company.delete({ where: { id } });

    await log({
      adminId: req.admin?.id,
      action: 'deleted',
      entity: 'company',
      entityId: id,
      summary: `${existing.name} — ${existing._count.quotes} quote(s), ${existing._count.messages} message(s) unlinked, not deleted`,
    });
    res.status(204).end();
  }),
);

/* ----------------------------------------------------------- contacts --- */

adminCrmRouter.post(
  '/companies/:id/contacts',
  asyncHandler(async (req, res) => {
    const companyId = String(req.params.id);
    const input = contactCreateSchema.parse(req.body);

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    if (!company) throw notFound('That company no longer exists.');

    /* One primary per company: promoting somebody demotes whoever held it. */
    if (input.isPrimary) {
      await prisma.contact.updateMany({ where: { companyId, isPrimary: true }, data: { isPrimary: false } });
    }

    const contact = await prisma.contact.create({
      data: { ...input, email: input.email || null, companyId },
    });
    await log({
      adminId: req.admin?.id,
      action: 'created',
      entity: 'contact',
      entityId: contact.id,
      summary: `${contact.name} at ${company.name}`,
    });
    res.status(201).json({ data: contact });
  }),
);

adminCrmRouter.put(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = contactUpdateSchema.parse(req.body);
    const existing = await prisma.contact.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing) throw notFound('That contact no longer exists.');

    if (input.isPrimary) {
      await prisma.contact.updateMany({
        where: { companyId: existing.companyId, isPrimary: true, NOT: { id } },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: { ...input, ...(input.email !== undefined ? { email: input.email || null } : {}) },
    });
    await log({ adminId: req.admin?.id, action: 'updated', entity: 'contact', entityId: id, summary: contact.name });
    res.json({ data: contact });
  }),
);

adminCrmRouter.delete(
  '/contacts/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.contact.findUnique({ where: { id }, select: { name: true } });
    if (!existing) throw notFound('That contact no longer exists.');

    await prisma.contact.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'contact', entityId: id, summary: existing.name });
    res.status(204).end();
  }),
);

/* -------------------------------------------------------------- leads --- */

const LEAD_INCLUDE = {
  company: { select: { id: true, name: true, country: true, segment: true } },
  contact: { select: { id: true, name: true, email: true, whatsapp: true } },
  product: { select: { id: true, productName: true, slug: true } },
  category: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  _count: { select: { quotes: true, stageEvents: true } },
} satisfies Prisma.LeadInclude;

adminCrmRouter.get(
  '/leads',
  asyncHandler(async (req, res) => {
    const q = leadListQuery.parse(req.query);

    const and: Prisma.LeadWhereInput[] = [];
    if (q.stage) and.push({ stage: q.stage });
    if (q.source) and.push({ source: q.source });
    if (q.companyId) and.push({ companyId: q.companyId });
    if (q.ownerId) and.push({ ownerId: q.ownerId });
    if (q.score) {
      /* An override, when present, is the score — a filter that ignored it
         would contradict the column the admin is looking at. */
      and.push({ OR: [{ scoreOverride: q.score }, { scoreOverride: null, score: q.score }] });
    }
    if (q.overdue === 'yes') and.push({ nextFollowUpAt: { lt: new Date() }, closedAt: null });
    if (q.open === 'yes') and.push({ closedAt: null });
    if (q.open === 'no') and.push({ NOT: { closedAt: null } });
    if (q.q) {
      and.push({
        OR: [
          { title: { contains: q.q, mode: 'insensitive' } },
          { reference: { contains: q.q, mode: 'insensitive' } },
          { requirements: { contains: q.q, mode: 'insensitive' } },
          { company: { name: { contains: q.q, mode: 'insensitive' } } },
          { contact: { name: { contains: q.q, mode: 'insensitive' } } },
          { contact: { email: { contains: q.q, mode: 'insensitive' } } },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        include: LEAD_INCLUDE,
      }),
    ]);

    res.json({
      data: rows,
      meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.max(1, Math.ceil(total / q.perPage)) },
    });
  }),
);

/** The Kanban board: every open lead, grouped by stage. Separate from the
 *  list because a board wants all of them at once and none of the paging. */
adminCrmRouter.get(
  '/leads/board',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.lead.findMany({
      where: { closedAt: null },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      /* A board is for working, not for archaeology. If somebody has more
         open leads than this, the list view with filters is the right tool
         and the board would be unreadable anyway. */
      take: 300,
      include: LEAD_INCLUDE,
    });

    const closed = await prisma.lead.findMany({
      where: { NOT: { closedAt: null } },
      orderBy: { closedAt: 'desc' },
      take: 20,
      include: LEAD_INCLUDE,
    });

    res.json({ data: { open: rows, recentlyClosed: closed } });
  }),
);

adminCrmRouter.get(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findUnique({
      where: { id: String(req.params.id) },
      include: {
        ...LEAD_INCLUDE,
        stageEvents: { orderBy: { createdAt: 'asc' }, include: { by: { select: { name: true } } } },
        quotes: { select: { id: true, reference: true, status: true, quantity: true, createdAt: true } },
        conversations: { select: { id: true, messageCount: true, createdAt: true } },
      },
    });
    if (!lead) throw notFound('That lead no longer exists.');
    res.json({ data: lead });
  }),
);

adminCrmRouter.post(
  '/leads',
  asyncHandler(async (req, res) => {
    const input = leadCreateSchema.parse(req.body);

    const { id } = await createLeadWithReference({
      title: input.title,
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      stage: input.stage,
      source: input.source,
      productId: input.productId ?? null,
      categoryId: input.categoryId ?? null,
      quantity: input.quantity ?? null,
      size: input.size ?? null,
      customizationRequired: input.customizationRequired ?? null,
      requirements: input.requirements ?? null,
      ownerId: input.ownerId ?? null,
      tags: input.tags ?? [],
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      lastActivityAt: new Date(),
    });

    /* The opening stage is an event too, so a lead created straight into
       QUALIFIED does not look like it was never anywhere. */
    await prisma.leadStageEvent.create({
      data: { leadId: id, toStage: input.stage, byUserId: req.admin?.id ?? null, note: 'Lead created' },
    });

    const lead = await prisma.lead.findUnique({ where: { id }, include: LEAD_INCLUDE });
    await log({ adminId: req.admin?.id, action: 'created', entity: 'lead', entityId: id, summary: input.title });
    res.status(201).json({ data: lead });
  }),
);

adminCrmRouter.put(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = leadUpdateSchema.parse(req.body);
    const existing = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('That lead no longer exists.');

    const lead = await prisma.lead.update({
      where: { id },
      data: { ...input, lastActivityAt: new Date() },
      include: LEAD_INCLUDE,
    });
    await log({ adminId: req.admin?.id, action: 'updated', entity: 'lead', entityId: id, summary: lead.title });
    res.json({ data: lead });
  }),
);

adminCrmRouter.patch(
  '/leads/:id/stage',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const input = leadStageMoveSchema.parse(req.body);

    const moved = await moveLeadStage({
      leadId: id,
      toStage: input.stage,
      byUserId: req.admin?.id ?? null,
      note: input.note ?? null,
    });
    if (!moved) throw notFound('That lead no longer exists.');

    if (moved.from !== moved.to) {
      await log({
        adminId: req.admin?.id,
        action: 'status_changed',
        entity: 'lead',
        entityId: id,
        summary: `${moved.from} → ${moved.to}`,
      });
    }

    const lead = await prisma.lead.findUnique({ where: { id }, include: LEAD_INCLUDE });
    res.json({ data: lead });
  }),
);

adminCrmRouter.delete(
  '/leads/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.lead.findUnique({ where: { id }, select: { title: true } });
    if (!existing) throw notFound('That lead no longer exists.');

    await prisma.lead.delete({ where: { id } });
    await log({ adminId: req.admin?.id, action: 'deleted', entity: 'lead', entityId: id, summary: existing.title });
    res.status(204).end();
  }),
);

/* --------------------------------------------------------- unassigned --- */

/** Enquiries that arrived before the CRM existed, or that failed to match.
 *  Worth surfacing: they are real customers nobody has filed. */
adminCrmRouter.get(
  '/unlinked',
  asyncHandler(async (_req, res) => {
    const [quotes, messages, conversations] = await Promise.all([
      prisma.quoteRequest.findMany({
        where: { companyId: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, name: true, email: true, company: true, country: true, createdAt: true },
      }),
      prisma.contactMessage.findMany({
        where: { companyId: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, name: true, email: true, company: true, subject: true, createdAt: true },
      }),
      prisma.aIConversation.findMany({
        where: { companyId: null, NOT: { email: null } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, customerName: true, email: true, company: true, country: true, createdAt: true },
      }),
    ]);

    res.json({ data: { quotes, messages, conversations } });
  }),
);
