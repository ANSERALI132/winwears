/**
 * Public AI endpoints.
 *
 * Anyone on the internet can reach these, so every one is rate limited, size
 * capped and validated. Failures never surface a provider or database detail:
 * the customer gets a sentence and a WhatsApp button, the diagnosis goes to
 * the server log.
 */
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env';
import { asyncHandler } from '../middleware/error';
import { aiLimiter } from '../lib/rateLimit';
import { aiProvider } from '../ai';
import { AIProviderError } from '../ai/provider';
import { ChatUnavailable, sendMessage } from '../ai/conversation';
import { getAllSettings } from '../lib/settings';
import { prisma } from '../db';

export const aiRouter = Router();

/** Shown whenever the agent cannot answer, whatever the underlying cause.
 *  One sentence, then a way to reach a human. */
const FALLBACK =
  "Sorry, I'm temporarily unable to answer. You can contact the WIN WEARS team directly on WhatsApp.";

const chatSchema = z.object({
  /* Opaque, server-issued. Rejected by length rather than trusted. */
  sessionId: z.string().trim().min(8).max(128).optional(),
  message: z.string().trim().min(1, 'Please type a message.').max(env.AI_MAX_INPUT_CHARS),
  productSlug: z.string().trim().max(120).optional(),
});

/**
 * Whether the widget should render at all, and what to greet with.
 * Called before the first message so the browser never has to discover the
 * assistant is offline by sending one.
 */
aiRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const settings = await getAllSettings();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      data: {
        enabled: aiProvider.configured,
        /* Never the model id or provider name — that is operator
           information, and the admin screen is where it belongs. */
        greeting: 'How can we help?',
        subtitle: 'Ask about footballs, customization, bulk orders or request a quote.',
        whatsappUrl: settings['contact.whatsappUrl'] ?? null,
        maxLength: env.AI_MAX_INPUT_CHARS,
      },
    });
  }),
);

/**
 * Records that something happened in the widget.
 *
 * Only the events a browser is in a position to observe — a WhatsApp button
 * being clicked is invisible to the server otherwise. Deliberately narrow:
 * the client names an event from a fixed list and nothing else, so this
 * cannot be used to write arbitrary rows. Unknown sessions are ignored rather
 * than reported, and a failure here never surfaces to the customer, because
 * an analytics write must not break a handoff.
 */
const eventSchema = z.object({
  sessionId: z.string().trim().min(8).max(128),
  event: z.enum(['CHAT_OPENED', 'WHATSAPP_CLICKED', 'PRODUCT_VIEWED']),
  /* A slug and nothing else. The browser cannot attach arbitrary metadata —
     that would make this endpoint a way to write whatever a caller liked into
     the analytics table. */
  slug: z.string().trim().max(120).optional(),
});

aiRouter.post(
  '/event',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const body = eventSchema.parse(req.body);
    const conversation = await prisma.aIConversation.findUnique({
      where: { sessionId: body.sessionId },
      select: { id: true },
    });
    if (conversation) {
      await prisma.aIEvent.create({
        data: {
          conversationId: conversation.id,
          eventType: body.event,
          ...(body.slug ? { metadata: { slugs: [body.slug] } } : {}),
        },
      });
    }
    res.status(204).end();
  }),
);

aiRouter.post(
  '/chat',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const body = chatSchema.parse(req.body);

    try {
      const result = await sendMessage(body);
      res.json({
        data: {
          sessionId: result.sessionId,
          reply: result.reply,
          products: result.products,
          escalate: result.escalate,
          whatsappUrl: result.whatsappUrl,
        },
      });
    } catch (err) {
      const settings = await getAllSettings();
      const whatsappUrl = settings['contact.whatsappUrl'] ?? null;

      if (err instanceof ChatUnavailable) {
        /* Expected states — the agent is off, or this conversation is done.
           Not logged as errors because nothing is broken. */
        res.status(503).json({
          data: {
            reply:
              err.reason === 'limit'
                ? 'This conversation has reached its length limit. Please continue with the WIN WEARS team on WhatsApp.'
                : FALLBACK,
            products: [],
            escalate: true,
            whatsappUrl,
          },
        });
        return;
      }

      if (err instanceof AIProviderError) {
        console.error('AI provider failure:', err.message, err.cause ?? '');
        res.status(503).json({
          data: { reply: FALLBACK, products: [], escalate: true, whatsappUrl },
        });
        return;
      }

      throw err;
    }
  }),
);
