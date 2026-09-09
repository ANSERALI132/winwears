/**
 * Quote-request tools.
 *
 * Two, deliberately separate. `remember_requirements` records what the
 * customer has said as they say it, so the tenth message still knows the
 * quantity from the second and the sales team can see a half-finished
 * enquiry. `create_quote_request` is the submission, and only that one
 * creates a record anyone will act on.
 *
 * Splitting them means an abandoned conversation still leaves something
 * useful behind, without a half-complete row appearing in the quote queue as
 * though it were a real request.
 */
import { z } from 'zod';
import { prisma } from '../../db';
import { createQuoteWithReference } from '../../lib/reference';
import { scoreLead } from '../../lib/leadScore';
import { attachRfqToLead, resolveIdentity, touchCompany, type ResolvedIdentity } from '../../lib/crm';
import type { AITool, ToolContext } from './types';

/* ---------------------------------------------------------- remember ----- */

const rememberInput = z.object({
  customerName: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  country: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(200).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  quantity: z.number().int().min(1).max(10_000_000).optional(),
  size: z.string().trim().max(64).optional(),
  categorySlug: z.string().trim().max(120).optional(),
  productSlug: z.string().trim().max(120).optional(),
  customizationRequired: z.boolean().optional(),
  requirements: z.string().trim().max(2000).optional(),
});

export const rememberRequirements: AITool<z.infer<typeof rememberInput>> = {
  definition: {
    name: 'remember_requirements',
    description:
      'Record what the customer has told you about their requirement, as soon as they say it. Call this whenever they give a quantity, size, ball type, customization need, name, company, country, email or WhatsApp number. Pass only the fields they actually stated â€” never guess or fill in a plausible value.',
    inputSchema: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        company: { type: 'string' },
        country: { type: 'string' },
        email: { type: 'string' },
        whatsapp: { type: 'string' },
        quantity: { type: 'integer', description: 'Number of footballs' },
        size: { type: 'string' },
        categorySlug: { type: 'string', description: 'Category slug from search_categories' },
        productSlug: { type: 'string', description: 'Product slug from search_products' },
        customizationRequired: { type: 'boolean', description: 'True if they want their own logo or design' },
        requirements: { type: 'string', description: 'Anything else about the order worth recording' },
      },
      additionalProperties: false,
    },
  },
  schema: rememberInput,
  async run(input, ctx) {
    if (!ctx.conversationId) return { saved: false, error: 'No active conversation.' };

    /* Slugs are resolved to ids here rather than trusted: the model supplies
       them from earlier tool results, and a stale or invented slug should
       leave the field empty rather than fail the whole call. */
    const [product, category] = await Promise.all([
      input.productSlug
        ? prisma.product.findFirst({
            where: { slug: input.productSlug, status: 'PUBLISHED', deletedAt: null },
            select: { id: true },
          })
        : null,
      input.categorySlug
        ? prisma.category.findFirst({ where: { slug: input.categorySlug, active: true }, select: { id: true } })
        : null,
    ]);

    const data: Record<string, unknown> = {};
    const set = (key: string, value: unknown) => {
      if (value !== undefined && value !== null && value !== '') data[key] = value;
    };

    set('customerName', input.customerName);
    set('company', input.company);
    set('country', input.country);
    set('email', input.email);
    set('whatsapp', input.whatsapp);
    set('quantity', input.quantity);
    set('size', input.size);
    set('requirements', input.requirements);
    if (input.customizationRequired !== undefined) data.customizationRequired = input.customizationRequired;
    if (product) data.productId = product.id;
    if (category) data.categoryId = category.id;

    /* A slug that resolved to nothing is reported rather than silently
       dropped, so the model can search again instead of assuming it stuck. */
    const unresolved: string[] = [];
    if (input.productSlug && !product) unresolved.push(`product "${input.productSlug}"`);
    if (input.categorySlug && !category) unresolved.push(`category "${input.categorySlug}"`);

    if (!Object.keys(data).length) {
      return {
        saved: false,
        note: unresolved.length
          ? `Nothing recorded — ${unresolved.join(' and ')} did not match a published record. Search again before recording it.`
          : 'Nothing to record.',
      };
    }

    const before = await prisma.aIConversation.findUnique({ where: { id: ctx.conversationId } });
    if (!before) return { saved: false, error: 'No active conversation.' };

    const merged = { ...before, ...data } as typeof before;
    data.leadScore = scoreLead({
      quantity: merged.quantity,
      company: merged.company,
      country: merged.country,
      email: merged.email,
      whatsapp: merged.whatsapp,
      customizationRequired: merged.customizationRequired,
      productInterest: Boolean(merged.productId || merged.categoryId),
    });

    await prisma.aIConversation.update({ where: { id: ctx.conversationId }, data });

    /* The first thing a customer volunteers is the start of a quote, whether
       or not one is ever submitted. Recorded once per conversation so the
       funnel counts people, not keystrokes. */
    const alreadyStarted = await prisma.aIEvent.count({
      where: { conversationId: ctx.conversationId, eventType: 'QUOTE_STARTED' },
    });
    if (!alreadyStarted) {
      await prisma.aIEvent.create({
        data: { conversationId: ctx.conversationId, eventType: 'QUOTE_STARTED' },
      });
    }

    /* Told back to the model so it knows what it still needs, and does not
       ask twice for something already given. */
    const have = ['customerName', 'company', 'country', 'email', 'whatsapp', 'quantity', 'size']
      .filter((k) => (merged as Record<string, unknown>)[k]);

    return {
      saved: true,
      recorded: Object.keys(data).filter((k) => k !== 'leadScore'),
      known: have,
      ...(unresolved.length ? { unresolved } : {}),
    };
  },
};

/* ------------------------------------------------------------ submit ----- */

const submitInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  country: z.string().trim().max(80).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  productSlug: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  quantity: z.number().int().min(1).max(10_000_000).optional(),
  size: z.string().trim().max(64).optional(),
  customizationRequired: z.boolean().optional(),
  message: z.string().trim().max(5000).optional(),
});

export const createQuoteRequest: AITool<z.infer<typeof submitInput>> = {
  definition: {
    name: 'create_quote_request',
    description:
      'Submit the customer\'s quote request to the WIN WEARS team. Requires a name and an email address. Only call this once the customer has confirmed they want to send it â€” never to "save progress", which is what remember_requirements is for. Returns a reference number to give them.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Customer name, as they gave it' },
        email: { type: 'string', description: 'Customer email address' },
        company: { type: 'string' },
        country: { type: 'string' },
        whatsapp: { type: 'string' },
        productSlug: { type: 'string', description: 'Product slug, if they named one' },
        category: { type: 'string', description: 'Category name, if no specific product' },
        quantity: { type: 'integer' },
        size: { type: 'string' },
        customizationRequired: { type: 'boolean' },
        message: { type: 'string', description: 'Their requirement in their own words' },
      },
      required: ['name', 'email'],
      additionalProperties: false,
    },
  },
  schema: submitInput,
  async run(input, ctx) {
    const product = input.productSlug
      ? await prisma.product.findFirst({
          where: { slug: input.productSlug, status: 'PUBLISHED', deletedAt: null },
          select: { id: true, productName: true },
        })
      : null;

    /* File it against an account, the same way the website form does, so a
       lead that arrived through the assistant is not a second class of
       record. A failure here must not lose the customer's request. */
    let identity: ResolvedIdentity = { companyId: null, contactId: null, createdCompany: false, createdContact: false };
    try {
      identity = await resolveIdentity({
        name: input.name,
        email: input.email,
        whatsapp: input.whatsapp ?? null,
        companyName: input.company ?? null,
        country: input.country ?? null,
        source: 'AI_ASSISTANT',
      });
    } catch (err) {
      console.error('[crm] could not resolve identity for an assistant quote request', err);
    }

    let leadId: string | null = null;
    try {
      leadId = await attachRfqToLead({
        companyId: identity.companyId,
        contactId: identity.contactId,
        title: input.quantity ? `${input.quantity} footballs` : 'Quote request',
        productId: product?.id ?? null,
        quantity: input.quantity ?? null,
        size: input.size ?? null,
        customizationRequired: input.customizationRequired ?? null,
        requirements: input.message ?? null,
        source: 'AI_ASSISTANT',
      });
    } catch (err) {
      console.error('[crm] could not attach an assistant quote request to a lead', err);
    }

    const { reference } = await createQuoteWithReference({
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      country: input.country ?? null,
      whatsapp: input.whatsapp ?? null,
      productId: product?.id ?? null,
      category: input.category ?? null,
      quantity: input.quantity ?? null,
      size: input.size ?? null,
      customizationRequired: input.customizationRequired ?? false,
      message: input.message ?? null,
      source: 'AI_AGENT',
      aiConversationId: ctx.conversationId,
      companyId: identity.companyId,
      contactId: identity.contactId,
      leadId,
      lastActivityAt: new Date(),
      status: 'NEW',
    });

    await touchCompany(identity.companyId);

    if (ctx.conversationId) {
      const conversation = await prisma.aIConversation.findUnique({ where: { id: ctx.conversationId } });
      await prisma.aIConversation.update({
        where: { id: ctx.conversationId },
        data: {
          status: 'QUALIFIED',
          customerName: input.name,
          email: input.email,
          /* The conversation now belongs to a known account, so it shows up
             on that customer's timeline rather than only in the AI screens. */
          ...(identity.companyId ? { companyId: identity.companyId } : {}),
          ...(identity.contactId ? { contactId: identity.contactId } : {}),
          ...(input.company ? { company: input.company } : {}),
          ...(input.country ? { country: input.country } : {}),
          ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
          ...(input.quantity ? { quantity: input.quantity } : {}),
          leadScore: scoreLead({
            quantity: input.quantity ?? conversation?.quantity,
            company: input.company ?? conversation?.company,
            country: input.country ?? conversation?.country,
            email: input.email,
            whatsapp: input.whatsapp ?? conversation?.whatsapp,
            customizationRequired: input.customizationRequired ?? conversation?.customizationRequired,
            productInterest: Boolean(product || conversation?.productId || conversation?.categoryId),
            quoteSubmitted: true,
          }),
        },
      });

      await prisma.aIEvent.create({
        data: {
          conversationId: ctx.conversationId,
          eventType: 'QUOTE_SUBMITTED',
          metadata: { reference },
        },
      });
    }

    return {
      submitted: true,
      reference,
      /* The model tells the customer this; the wording is fixed here so the
         promise made is the same every time. */
      tellCustomer: `Their request has been received with reference ${reference}. The WIN WEARS team will contact them. Do not promise a response time.`,
    };
  },
};
