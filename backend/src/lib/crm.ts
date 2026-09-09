/**
 * CRM service layer.
 *
 * Everything that decides *who an enquiry is from* lives here, so the answer
 * is the same whether a request arrived through the website form, the
 * assistant, or an admin typing it in.
 *
 * Matching is deliberately conservative. A wrong match merges two real
 * customers into one account, which is far harder to notice and undo than a
 * duplicate — so this only links on evidence the customer actually gave, and
 * leaves a duplicate rather than guessing.
 */
import type { CompanySegment, LeadSource, LeadStage, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { slugify } from './slug';

/* Mailbox providers where the domain says nothing about the organisation.
   Matching two gmail addresses to one company would merge strangers. */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com',
]);

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/** A company name inferred from a work email: "buyer@northside-fc.co.uk" ->
 *  "Northside Fc". Only ever a starting point — an admin renames it. */
function nameFromDomain(domain: string): string {
  const stem = domain.split('.')[0] ?? domain;
  return stem
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Slug that does not collide: northside-academy, -2, -3... */
async function uniqueCompanySlug(name: string): Promise<string> {
  const base = slugify(name) || 'company';
  for (let n = 1; n < 200; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export interface EnquiryIdentity {
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  companyName?: string | null;
  country?: string | null;
  source?: LeadSource;
}

export interface ResolvedIdentity {
  companyId: string | null;
  contactId: string | null;
  /** True when this enquiry created the account, so the caller can say so. */
  createdCompany: boolean;
  createdContact: boolean;
}

/**
 * Finds the company and contact an enquiry belongs to, creating them if this
 * is the first time we have heard from them.
 *
 * Order matters: an existing contact's company wins over a name typed into a
 * form, because people mistype their own employer and the account they are
 * already attached to is better evidence than this one message.
 */
export async function resolveIdentity(input: EnquiryIdentity): Promise<ResolvedIdentity> {
  const email = input.email?.trim().toLowerCase() || null;
  const whatsapp = input.whatsapp?.trim() || null;

  /* 1. An existing person, by the two things that identify one. */
  const existingContact = email
    ? await prisma.contact.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      })
    : whatsapp
      ? await prisma.contact.findFirst({ where: { whatsapp }, orderBy: { createdAt: 'asc' } })
      : null;

  if (existingContact) {
    /* Fill in anything we did not know before, without overwriting anything
       we did — a later enquiry adding a phone number is useful, a later
       enquiry blanking a name is not. */
    const patch: Prisma.ContactUpdateInput = {};
    if (!existingContact.whatsapp && whatsapp) patch.whatsapp = whatsapp;
    if (!existingContact.email && email) patch.email = email;
    if (Object.keys(patch).length) {
      await prisma.contact.update({ where: { id: existingContact.id }, data: patch });
    }
    return {
      companyId: existingContact.companyId,
      contactId: existingContact.id,
      createdCompany: false,
      createdContact: false,
    };
  }

  /* 2. An existing company, by the name they typed or their email domain. */
  const typedName = input.companyName?.trim() || null;
  const domain = emailDomain(email);
  const usableDomain = domain && !FREE_MAIL.has(domain) ? domain : null;

  let company = typedName
    ? await prisma.company.findFirst({
        where: { name: { equals: typedName, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      })
    : null;

  if (!company && usableDomain) {
    company = await prisma.company.findFirst({
      where: { website: { contains: usableDomain, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  let createdCompany = false;

  if (!company) {
    /* 3. Nothing matched. Name it from what they gave us, in order of how
          much it tells us: the company they typed, then a work email domain,
          then the person themselves. A free-mail address with no company
          name is genuinely one individual, and calling that account
          "Gmail" would be worse than useless. */
    const name = typedName || (usableDomain ? nameFromDomain(usableDomain) : null) || input.name?.trim() || 'Unknown enquirer';

    company = await prisma.company.create({
      data: {
        name,
        slug: await uniqueCompanySlug(name),
        country: input.country?.trim() || null,
        website: usableDomain ? `https://${usableDomain}` : null,
        source: input.source ?? 'OTHER',
        segment: 'OTHER',
      },
    });
    createdCompany = true;
  } else if (!company.country && input.country?.trim()) {
    await prisma.company.update({ where: { id: company.id }, data: { country: input.country.trim() } });
  }

  const contact = await prisma.contact.create({
    data: {
      companyId: company.id,
      name: input.name?.trim() || email || whatsapp || 'Unknown',
      email,
      whatsapp,
      /* The first person we hear from at an account is the one to call back
         until somebody says otherwise. */
      isPrimary: createdCompany,
    },
  });

  return { companyId: company.id, contactId: contact.id, createdCompany, createdContact: true };
}

/** Records that something actually happened with an account. Only ever
 *  called from real activity — an empty "last contacted" is information. */
export async function touchCompany(companyId: string | null | undefined): Promise<void> {
  if (!companyId) return;
  await prisma.company.update({
    where: { id: companyId },
    data: { lastContactAt: new Date() },
  }).catch(() => {
    /* The account may have been deleted between the enquiry and this write.
       Losing a timestamp must not fail the enquiry that produced it. */
  });
}

/* ---------------------------------------------------------------- leads -- */

const LEAD_PREFIX = 'WW-LEAD';

/** Same approach as the RFQ reference: count, then write under the unique
 *  index and retry, because counting alone races. */
export async function createLeadWithReference(
  data: Omit<Prisma.LeadUncheckedCreateInput, 'reference'>,
): Promise<{ id: string; reference: string }> {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const used = await prisma.lead.count({ where: { reference: { startsWith: `${LEAD_PREFIX}-${year}-` } } });
    const reference = `${LEAD_PREFIX}-${year}-${String(used + 1 + attempt).padStart(4, '0')}`;
    try {
      const row = await prisma.lead.create({ data: { ...data, reference }, select: { id: true, reference: true } });
      return { id: row.id, reference: row.reference as string };
    } catch (err) {
      const collided =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
      if (!collided) throw err;
    }
  }

  const row = await prisma.lead.create({
    data: { ...data, reference: `${LEAD_PREFIX}-${year}-${Date.now().toString(36).toUpperCase()}` },
    select: { id: true, reference: true },
  });
  return { id: row.id, reference: row.reference as string };
}

/**
 * Moves a lead and records the move.
 *
 * The write and the history entry go in one transaction: a stage that
 * changed without a corresponding event would make the timeline lie, and the
 * timeline is the reason the history exists.
 */
export async function moveLeadStage(input: {
  leadId: string;
  toStage: LeadStage;
  byUserId?: string | null;
  note?: string | null;
}): Promise<{ from: LeadStage; to: LeadStage } | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { stage: true, closedAt: true },
  });
  if (!lead) return null;
  if (lead.stage === input.toStage) return { from: lead.stage, to: lead.stage };

  const closing = input.toStage === 'WON' || input.toStage === 'LOST';

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: input.leadId },
      data: {
        stage: input.toStage,
        lastActivityAt: new Date(),
        /* Set once. Reopening a closed lead and closing it again should not
           rewrite when it first closed. */
        ...(closing && !lead.closedAt ? { closedAt: new Date() } : {}),
        ...(closing ? {} : { closedAt: null }),
      },
    }),
    prisma.leadStageEvent.create({
      data: {
        leadId: input.leadId,
        fromStage: lead.stage,
        toStage: input.toStage,
        byUserId: input.byUserId ?? null,
        note: input.note ?? null,
      },
    }),
  ]);

  return { from: lead.stage, to: input.toStage };
}

/**
 * Finds the opportunity an incoming RFQ belongs to, opening one if there
 * isn't a suitable one already.
 *
 * A quote request *is* an opportunity, so leaving it sitting in an inbox
 * with no lead attached is how enquiries get forgotten. But a customer who
 * sends three requests in a week is one opportunity being refined, not
 * three — so an open lead on the same account is reused and advanced rather
 * than duplicated.
 *
 * Returns null when there is no account to hang a lead off, which happens
 * when identity resolution failed. That is not worth failing the enquiry
 * over; the RFQ still lands, unfiled, and shows up in the unlinked list.
 */
export async function attachRfqToLead(input: {
  companyId: string | null;
  contactId: string | null;
  title: string;
  productId?: string | null;
  categoryId?: string | null;
  quantity?: number | null;
  size?: string | null;
  customizationRequired?: boolean | null;
  requirements?: string | null;
  source: LeadSource;
}): Promise<string | null> {
  if (!input.companyId) return null;

  const open = await prisma.lead.findFirst({
    where: { companyId: input.companyId, closedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, stage: true, quantity: true },
  });

  if (open) {
    /* Advance to RFQ only from the stages that come before it. A lead already
       in negotiation should not be dragged backwards because the customer
       sent another form. */
    const earlier: LeadStage[] = ['NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY'];
    if (earlier.includes(open.stage)) {
      await moveLeadStage({ leadId: open.id, toStage: 'RFQ', note: 'New quote request received' });
    } else {
      await prisma.lead.update({ where: { id: open.id }, data: { lastActivityAt: new Date() } });
    }

    /* A later request usually supersedes the earlier figure. */
    if (input.quantity && input.quantity !== open.quantity) {
      await prisma.lead.update({ where: { id: open.id }, data: { quantity: input.quantity } });
    }
    return open.id;
  }

  const { id } = await createLeadWithReference({
    title: input.title,
    companyId: input.companyId,
    contactId: input.contactId,
    stage: 'RFQ',
    source: input.source,
    productId: input.productId ?? null,
    categoryId: input.categoryId ?? null,
    quantity: input.quantity ?? null,
    size: input.size ?? null,
    customizationRequired: input.customizationRequired ?? null,
    requirements: input.requirements ?? null,
    lastActivityAt: new Date(),
  });

  await prisma.leadStageEvent.create({
    data: { leadId: id, toStage: 'RFQ', note: 'Opened by a quote request' },
  });

  return id;
}

/* ------------------------------------------------------------ timeline -- */

export type TimelineKind = 'lead' | 'quote' | 'message' | 'conversation' | 'stage';

export interface TimelineEntry {
  kind: TimelineKind;
  at: Date;
  title: string;
  detail?: string | null;
  /** Where the admin screen should link to, if anywhere. */
  href?: string | null;
}

/**
 * Everything that has happened with one account, in one list.
 *
 * Assembled in code rather than as a SQL union: the five sources have
 * genuinely different shapes, and a union that flattened them would need
 * unpacking again at the other end. An account has tens of these, not
 * thousands.
 */
export async function companyTimeline(companyId: string): Promise<TimelineEntry[]> {
  const [leads, quotes, messages, conversations, stages] = await Promise.all([
    prisma.lead.findMany({
      where: { companyId },
      select: { id: true, reference: true, title: true, stage: true, createdAt: true },
    }),
    prisma.quoteRequest.findMany({
      where: { companyId },
      select: { id: true, reference: true, quantity: true, createdAt: true, product: { select: { productName: true } } },
    }),
    prisma.contactMessage.findMany({
      where: { companyId },
      select: { id: true, subject: true, message: true, createdAt: true },
    }),
    prisma.aIConversation.findMany({
      where: { companyId },
      select: { id: true, messageCount: true, createdAt: true, leadScore: true },
    }),
    prisma.leadStageEvent.findMany({
      where: { lead: { companyId } },
      select: { id: true, fromStage: true, toStage: true, createdAt: true, lead: { select: { id: true, title: true } } },
    }),
  ]);

  const entries: TimelineEntry[] = [
    ...leads.map((l) => ({
      kind: 'lead' as const,
      at: l.createdAt,
      title: `Lead opened — ${l.title}`,
      detail: l.reference,
      href: `#/crm/leads/${l.id}`,
    })),
    ...quotes.map((q) => ({
      kind: 'quote' as const,
      at: q.createdAt,
      title: q.product?.productName ? `Quote request — ${q.product.productName}` : 'Quote request',
      detail: [q.reference, q.quantity ? `${q.quantity} balls` : null].filter(Boolean).join(' · ') || null,
      href: `#/quotes`,
    })),
    ...messages.map((m) => ({
      kind: 'message' as const,
      at: m.createdAt,
      title: m.subject ? `Message — ${m.subject}` : 'Contact message',
      detail: m.message.slice(0, 140),
      href: `#/messages`,
    })),
    ...conversations.map((c) => ({
      kind: 'conversation' as const,
      at: c.createdAt,
      title: `Assistant conversation — ${c.messageCount} message${c.messageCount === 1 ? '' : 's'}`,
      detail: `Scored ${c.leadScore}`,
      href: `#/ai/conversations/${c.id}`,
    })),
    ...stages.map((s) => ({
      kind: 'stage' as const,
      at: s.createdAt,
      title: s.fromStage ? `${s.lead.title}: ${s.fromStage} → ${s.toStage}` : `${s.lead.title}: opened at ${s.toStage}`,
      detail: null,
      href: `#/crm/leads/${s.lead.id}`,
    })),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
