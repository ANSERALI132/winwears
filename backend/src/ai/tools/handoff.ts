/**
 * Handoff tools.
 *
 * Two, with different jobs. escalate_to_human is the decision that a person
 * is needed and the record of why; generate_whatsapp_link is for a customer
 * who simply asked for WhatsApp and is not stuck.
 *
 * Neither returns a URL for the model to retype — the widget renders the
 * button from the link the server attaches to the reply, so the address is
 * never something a language model can mangle or invent.
 */
import { z } from 'zod';
import { prisma } from '../../db';
import { getAllSettings } from '../../lib/settings';
import { getAiConfig } from '../../lib/aiSettings';
import { handoffLink, handoffMessage } from '../../lib/whatsapp';
import type { AITool } from './types';

const input = z.object({
  reason: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe('Why a person is needed, for the sales team'),
});

export const generateWhatsappLink: AITool<z.infer<typeof input>> = {
  definition: {
    name: 'generate_whatsapp_link',
    description:
      'Offer a WhatsApp handoff carrying what the customer has already told you, so they do not repeat themselves. Use this when they simply ask for WhatsApp and you were able to help. If you are handing over because you cannot answer, use escalate_to_human instead. The interface shows the button — do not write a URL in your reply.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why a person is needed, recorded for the sales team' },
      },
      additionalProperties: false,
    },
  },
  schema: input,
  async run(inputValue, ctx) {
    const settings = await getAllSettings();

    const conversation = ctx.conversationId
      ? await prisma.aIConversation.findUnique({
          where: { id: ctx.conversationId },
          include: { product: { select: { productName: true, sku: true } } },
        })
      : null;

    const message = handoffMessage(conversation, conversation?.product ?? null);
    const link = handoffLink(settings['contact.whatsappUrl'], message);

    if (ctx.conversationId) {
      await prisma.aIConversation.update({
        where: { id: ctx.conversationId },
        data: {
          escalatedAt: conversation?.escalatedAt ?? new Date(),
          ...(inputValue.reason && !conversation?.requirements
            ? { requirements: `Escalated: ${inputValue.reason}` }
            : {}),
        },
      });
      await prisma.aIEvent.create({
        data: {
          conversationId: ctx.conversationId,
          eventType: 'HUMAN_ESCALATION',
          metadata: inputValue.reason ? { reason: inputValue.reason } : undefined,
        },
      });
    }

    return {
      offered: Boolean(link),
      /* What the message will say, so the model can describe the handoff
         accurately without reproducing the link. */
      carries: message.split('\n').slice(1, -1),
      tellCustomer:
        'Tell them you can connect them with the WIN WEARS team, and that the buttons below have the details ready. Do not write out a URL or a phone number.',
    };
  },
};

/* ---------------------------------------------------------- escalate ----- */

/** The §16 triggers, as a closed list. An enum rather than free text so the
 *  admin dashboard can count them and the sales team can see which questions
 *  the agent keeps failing to answer — that list is a to-do list for the
 *  knowledge base. */
const REASONS = [
  'asked_for_human',
  'wants_to_negotiate',
  'information_not_confirmed',
  'complex_technical_requirement',
  'special_production_arrangement',
  'shipping_terms',
  'payment_terms',
  'high_value_lead',
  'uncertain',
] as const;

const escalateInput = z.object({
  reason: z.enum(REASONS),
  detail: z.string().trim().max(300).optional(),
});

/** The sentence §16 specifies. Still one fixed line rather than something the
 *  model improvises per conversation — an admin can reword it in
 *  /admin → AI Assistant → Settings, and this is what they get if they have
 *  not. */
export const ESCALATION_LINE =
  "I'd be happy to connect you with the WIN WEARS team for an accurate answer.";

export const escalateToHuman: AITool<z.infer<typeof escalateInput>> = {
  definition: {
    name: 'escalate_to_human',
    description:
      'Hand the conversation to the WIN WEARS team. Call this the moment you cannot answer from confirmed information, or the customer asks for a person, wants to negotiate, needs confirmed shipping or payment terms, has a requirement outside the records, or you are simply unsure. Handing over early is correct, not a failure. Do not keep trying after calling this.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', enum: [...REASONS], description: 'Why a person is needed' },
        detail: { type: 'string', description: 'One line for the sales team about what they asked' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
  },
  schema: escalateInput,
  async run(inputValue, ctx) {
    if (ctx.conversationId) {
      const existing = await prisma.aIConversation.findUnique({
        where: { id: ctx.conversationId },
        select: { escalatedAt: true, status: true },
      });

      await prisma.aIConversation.update({
        where: { id: ctx.conversationId },
        data: {
          /* First escalation wins: when it started mattering is more useful
             than when it last came up. */
          escalatedAt: existing?.escalatedAt ?? new Date(),
          /* A conversation already further along the pipeline is not dragged
             back to NEW by a late question. */
          ...(existing?.status === 'NEW' ? { status: 'QUALIFIED' } : {}),
        },
      });

      await prisma.aIEvent.create({
        data: {
          conversationId: ctx.conversationId,
          eventType: 'HUMAN_ESCALATION',
          metadata: { reason: inputValue.reason, ...(inputValue.detail ? { detail: inputValue.detail } : {}) },
        },
      });
    }

    const { escalationMessage } = await getAiConfig();

    return {
      escalated: true,
      say: escalationMessage,
      tellCustomer:
        'Say that line, then stop. The interface shows the WhatsApp and quote buttons. Do not attempt an answer anyway, do not guess, and do not write out a URL or phone number.',
    };
  },
};
