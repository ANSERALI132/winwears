/**
 * The command centre.
 *
 * Answers one question — what needs attention — and nothing else. §2 asks
 * for a dashboard that is not full of meaningless numbers, so this returns
 * *priorities*, and a priority only exists when there is actually something
 * to do. A quiet morning returns an empty list, which is the useful answer.
 *
 * Every figure here is counted from real rows. Nothing is estimated, and no
 * panel is invented for a module the business has not started using: there
 * are no orders, no production runs and no shipments in this database, so
 * this reports none rather than showing four zeroes that look like a system
 * that is not working.
 */
import { Router } from 'express';
import { prisma } from '../../db';
import { asyncHandler } from '../../middleware/error';

export const adminDashboardRouter = Router();

/** How long an unanswered enquiry is fine before it is worth chasing. Not a
 *  guess about WIN WEARS' service level — just the point at which "nobody
 *  has looked at this" is worth saying out loud. */
const STALE_ENQUIRY_HOURS = 24;

type Severity = 'urgent' | 'attention' | 'info';

interface Priority {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  count: number;
  href: string;
}

adminDashboardRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_ENQUIRY_HOURS * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      overdueFollowUps,
      unassignedLeads,
      newQuotes,
      staleQuotes,
      unreadMessages,
      unfiledQuotes,
      unfiledMessages,
      escalations,
      openLeads,
      leadsThisWeek,
      companiesThisWeek,
      quotesThisWeek,
      productsMissingImages,
      draftProducts,
      publishedProducts,
      companies,
    ] = await Promise.all([
      prisma.lead.count({ where: { closedAt: null, nextFollowUpAt: { lt: now } } }),
      prisma.lead.count({ where: { closedAt: null, ownerId: null } }),
      prisma.quoteRequest.count({ where: { status: 'NEW' } }),
      prisma.quoteRequest.count({ where: { status: 'NEW', createdAt: { lt: staleBefore } } }),
      prisma.contactMessage.count({ where: { status: 'NEW' } }),
      prisma.quoteRequest.count({ where: { companyId: null } }),
      prisma.contactMessage.count({ where: { companyId: null } }),
      prisma.aIConversation.count({ where: { NOT: { escalatedAt: null }, status: { in: ['NEW', 'QUALIFIED'] } } }),
      prisma.lead.count({ where: { closedAt: null } }),
      prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.company.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.quoteRequest.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.product.count({ where: { status: 'PUBLISHED', deletedAt: null, images: { none: {} } } }),
      prisma.product.count({ where: { status: 'DRAFT', deletedAt: null } }),
      prisma.product.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      prisma.company.count(),
    ]);

    /* Ordered by how much it costs to ignore, not by how many there are.
       A customer waiting a day outranks a product with no photograph. */
    const priorities: Priority[] = [];
    const add = (p: Priority) => { if (p.count > 0) priorities.push(p); };

    add({
      id: 'stale-quotes',
      severity: 'urgent',
      title: 'Quote requests waiting over a day',
      detail: 'Nobody has moved these on since they arrived.',
      count: staleQuotes,
      href: '#/quotes',
    });
    add({
      id: 'escalations',
      severity: 'urgent',
      title: 'Assistant handed these to a person',
      detail: 'The assistant could not answer and offered the team. Still open.',
      count: escalations,
      href: '#/ai/conversations?escalated=yes',
    });
    add({
      id: 'overdue-followups',
      severity: 'urgent',
      title: 'Follow-ups now overdue',
      detail: 'Leads whose follow-up date has passed.',
      count: overdueFollowUps,
      href: '#/crm/leads',
    });
    add({
      id: 'new-quotes',
      severity: 'attention',
      title: 'New quote requests',
      detail: 'Arrived and not yet actioned.',
      count: newQuotes - staleQuotes,
      href: '#/quotes',
    });
    add({
      id: 'unread-messages',
      severity: 'attention',
      title: 'Unread messages',
      detail: 'From the contact form.',
      count: unreadMessages,
      href: '#/messages',
    });
    add({
      id: 'unassigned',
      severity: 'attention',
      title: 'Leads with no owner',
      detail: 'Nobody is responsible for these yet.',
      count: unassignedLeads,
      href: '#/crm/leads',
    });
    add({
      id: 'unfiled',
      severity: 'info',
      title: 'Enquiries not filed to a customer',
      detail: 'These arrived before the CRM existed, or could not be matched.',
      count: unfiledQuotes + unfiledMessages,
      href: '#/crm',
    });
    add({
      id: 'missing-images',
      severity: 'info',
      title: 'Published footballs with no photograph',
      detail: 'They appear on the site with nothing to show.',
      count: productsMissingImages,
      href: '#/products',
    });
    add({
      id: 'drafts',
      severity: 'info',
      title: 'Products still in draft',
      detail: 'Not visible to customers.',
      count: draftProducts,
      href: '#/products?status=DRAFT',
    });

    res.json({
      data: {
        priorities,
        /* The week in figures. Small and clickable, per §2 — every one of
           these leads somewhere. */
        week: {
          newLeads: leadsThisWeek,
          newCustomers: companiesThisWeek,
          newQuoteRequests: quotesThisWeek,
        },
        pipeline: { open: openLeads, customers: companies },
        catalogue: { published: publishedProducts, drafts: draftProducts },
        /* Named so the screen can say what it is *not* reporting on, rather
           than leaving the owner to wonder where production went. */
        notConfigured: ['orders', 'production', 'quality control', 'inventory', 'shipping'],
        generatedAt: now,
        since: dayAgo,
      },
    });
  }),
);

/* ---------------------------------------------------------------- pulse -- */

interface PulseEntry {
  at: Date;
  kind: string;
  title: string;
  detail?: string | null;
  href?: string | null;
}

/* The audit log stores machine-shaped values. These two turn them into a
   sentence, because "WIN WEARS status_changed a ai knowledge" is not one. */
const ACTION_WORDS: Record<string, string> = {
  status_changed: 'changed the status of',
  signed_in: 'signed in',
  signed_out: 'signed out',
};

const ENTITY_WORDS: Record<string, string> = {
  product: 'a product',
  category: 'a category',
  company: 'a customer',
  contact: 'a contact',
  lead: 'a lead',
  ai_knowledge: 'a knowledge entry',
  ai_conversation: 'a conversation',
  ai_settings: 'the assistant settings',
  settings: 'the site settings',
};

function describeAction(action: string): string {
  return ACTION_WORDS[action] ?? action;
}

function describeEntity(entity: string): string {
  return ENTITY_WORDS[entity] ?? `a ${entity.replace(/_/g, ' ')}`;
}

/**
 * The live activity stream.
 *
 * Assembled from what actually happened rather than from a dedicated events
 * table: five small queries against rows that already exist beats a sixth
 * table that has to be kept in step with them, and this list is read a few
 * times a day.
 */
adminDashboardRouter.get(
  '/pulse',
  asyncHandler(async (_req, res) => {
    const take = 12;

    const [quotes, messages, conversations, stages, admin] = await Promise.all([
      prisma.quoteRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true, reference: true, name: true, country: true, quantity: true, source: true, createdAt: true,
          companyAccount: { select: { id: true, name: true } },
        },
      }),
      prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, name: true, subject: true, createdAt: true, companyAccount: { select: { id: true, name: true } } },
      }),
      prisma.aIConversation.findMany({
        where: { OR: [{ NOT: { escalatedAt: null } }, { leadScore: { in: ['HIGH', 'URGENT'] } }] },
        orderBy: { lastMessageAt: 'desc' },
        take,
        select: { id: true, customerName: true, country: true, leadScore: true, escalatedAt: true, lastMessageAt: true, createdAt: true },
      }),
      prisma.leadStageEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true, fromStage: true, toStage: true, createdAt: true,
          lead: { select: { id: true, title: true, company: { select: { name: true } } } },
          by: { select: { name: true } },
        },
      }),
      prisma.activityLog.findMany({
        where: { entity: { in: ['product', 'category', 'company', 'lead', 'ai_knowledge'] } },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, action: true, entity: true, summary: true, createdAt: true, admin: { select: { name: true } } },
      }),
    ]);

    const entries: PulseEntry[] = [
      ...quotes.map((q) => ({
        at: q.createdAt,
        kind: 'quote',
        title: q.source === 'AI_AGENT'
          ? `Assistant collected a quote request from ${q.name}`
          : `Quote request from ${q.name}`,
        detail: [q.companyAccount?.name, q.country, q.quantity ? `${q.quantity} balls` : null, q.reference]
          .filter(Boolean).join(' · ') || null,
        href: q.companyAccount ? `#/crm/companies/${q.companyAccount.id}` : '#/quotes',
      })),
      ...messages.map((m) => ({
        at: m.createdAt,
        kind: 'message',
        title: `Message from ${m.name}`,
        detail: [m.companyAccount?.name, m.subject].filter(Boolean).join(' · ') || null,
        href: m.companyAccount ? `#/crm/companies/${m.companyAccount.id}` : '#/messages',
      })),
      ...conversations.map((c) => ({
        at: c.lastMessageAt ?? c.createdAt,
        kind: c.escalatedAt ? 'escalation' : 'ai-lead',
        title: c.escalatedAt
          ? `Assistant asked for a person${c.customerName ? ` — ${c.customerName}` : ''}`
          : `Assistant scored a ${c.leadScore.toLowerCase()} lead${c.customerName ? ` — ${c.customerName}` : ''}`,
        detail: c.country,
        href: `#/ai/conversations/${c.id}`,
      })),
      ...stages.map((s) => ({
        at: s.createdAt,
        kind: 'stage',
        title: s.fromStage
          ? `${s.lead.title}: ${s.fromStage} → ${s.toStage}`
          : `Lead opened — ${s.lead.title}`,
        detail: [s.lead.company?.name, s.by?.name].filter(Boolean).join(' · ') || null,
        href: `#/crm/leads/${s.lead.id}`,
      })),
      ...admin.map((a) => ({
        at: a.createdAt,
        kind: 'admin',
        title: `${a.admin?.name ?? 'Someone'} ${describeAction(a.action)} ${describeEntity(a.entity)}`,
        detail: a.summary,
        href: null,
      })),
    ];

    res.json({
      data: entries
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, 25),
    });
  }),
);
