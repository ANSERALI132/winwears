/**
 * Handoff tool.
 *
 * The model calls this when it decides the customer should be talking to a
 * person. It does not return a URL for the model to retype — the widget
 * renders the button from the link the server attaches to the reply, so the
 * address is never something a language model can mangle or invent.
 */
import { z } from 'zod';
import { prisma } from '../../db';
import { getAllSettings } from '../../lib/settings';
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
      'Offer the customer a WhatsApp handoff to the WIN WEARS team, carrying what they have already told you so they do not repeat themselves. Call this when they ask for a person, want to negotiate, need confirmed shipping or payment terms, or when you do not have confirmed information. The interface shows the button — do not write a URL in your reply.',
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
