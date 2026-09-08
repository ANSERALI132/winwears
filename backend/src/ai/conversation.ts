/**
 * The agent loop.
 *
 * Takes one customer message and returns one reply, running whatever tools
 * the model asks for in between and writing the whole exchange — tool calls
 * included — to the database so an admin can later see which facts an answer
 * was built from.
 *
 * Three ceilings apply, all from the environment: how many messages a single
 * conversation may hold, how many tool round-trips one question may take, and
 * how much history is replayed to the model. Each is a cost control, and each
 * is enforced here rather than trusted to the model.
 */
import crypto from 'node:crypto';
import type { AIConversation, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { aiProvider } from './index';
import { AIProviderError, type AITurn } from './provider';
import { buildSystemPrompt } from './prompt';
import { runTool, toolDefinitions } from './tools';

/**
 * How many past messages are replayed.
 *
 * The API is stateless, so the whole conversation is re-sent every turn and
 * every turn is billed for it. Twenty messages is roughly ten exchanges —
 * enough that "500 of those" still refers to the ball discussed earlier,
 * without paying for the start of a long conversation on every message.
 */
const HISTORY_WINDOW = 20;

export interface ChatResult {
  sessionId: string;
  reply: string;
  /** Products the tools surfaced this turn, for the widget to render as
   *  cards rather than the model re-typing them into prose. */
  products: unknown[];
  escalate: boolean;
  conversationId: string;
}

export class ChatUnavailable extends Error {
  readonly reason: 'disabled' | 'limit' | 'provider';
  constructor(message: string, reason: ChatUnavailable['reason']) {
    super(message);
    this.name = 'ChatUnavailable';
    this.reason = reason;
  }
}

/* ------------------------------------------------------------ session ----- */

/**
 * Finds the caller's conversation, or starts one.
 *
 * The id is generated here, never accepted from the browser. A conversation
 * holds whatever contact details the customer has given, so a guessable or
 * caller-chosen id would let a stranger read someone else's enquiry. 256 bits
 * of randomness makes the id a bearer token for that conversation and nothing
 * else.
 */
async function resolveConversation(sessionId: string | undefined): Promise<AIConversation> {
  if (sessionId) {
    const existing = await prisma.aIConversation.findUnique({ where: { sessionId } });
    if (existing) return existing;
    /* Unknown id: start fresh under a new one rather than reporting whether
       that session existed. */
  }

  return prisma.aIConversation.create({
    data: { sessionId: crypto.randomBytes(32).toString('base64url') },
  });
}

/** Rebuilds the model's view of the conversation from the stored transcript. */
async function loadTurns(conversationId: string): Promise<AITurn[]> {
  const rows = await prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_WINDOW,
  });

  const turns: AITurn[] = [];
  for (const row of rows.reverse()) {
    if (row.role === 'USER') {
      turns.push({ role: 'user', text: row.content });
    } else if (row.role === 'ASSISTANT') {
      turns.push({ role: 'assistant', text: row.content, toolCalls: [] });
    }
    /* TOOL rows are kept for the admin transcript but not replayed. Their
       results are already reflected in the assistant text that followed, and
       re-sending them would pay for the same product data every turn. */
  }

  /* A window can begin mid-exchange; the API requires the first turn to be
     from the user. */
  while (turns.length > 0 && turns[0]?.role !== 'user') turns.shift();
  return turns;
}

/* --------------------------------------------------------------- send ----- */

export async function sendMessage(input: {
  sessionId?: string;
  message: string;
  /** Slug of the product page the widget was opened from, if any. */
  productSlug?: string;
}): Promise<ChatResult> {
  if (!aiProvider.configured) {
    throw new ChatUnavailable('The assistant is not configured.', 'disabled');
  }

  const conversation = await resolveConversation(input.sessionId);

  if (conversation.messageCount >= env.AI_MAX_MESSAGES_PER_CONVERSATION) {
    throw new ChatUnavailable('This conversation has reached its length limit.', 'limit');
  }

  const history = await loadTurns(conversation.id);

  /* Page context is stated as a fact for this turn rather than pasted into
     the customer's own words, so the model can weigh it and the transcript
     still shows exactly what the customer typed. */
  const opening = input.productSlug
    ? `[The customer is viewing the product page for slug "${input.productSlug}".]\n\n${input.message}`
    : input.message;

  const turns: AITurn[] = [...history, { role: 'user', text: opening }];

  await prisma.aIMessage.create({
    data: { conversationId: conversation.id, role: 'USER', content: input.message },
  });

  const system = await buildSystemPrompt();
  const products: unknown[] = [];
  let reply = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let escalate = false;

  for (let iteration = 0; iteration < env.AI_MAX_TOOL_ITERATIONS; iteration += 1) {
    const completion = await aiProvider.complete({
      system,
      turns,
      tools: toolDefinitions,
      maxTokens: env.AI_MAX_TOKENS,
    });

    inputTokens += completion.usage.inputTokens;
    outputTokens += completion.usage.outputTokens;

    /* A safety refusal is not a retry case — it is a handover. */
    if (completion.stopReason === 'refusal') {
      escalate = true;
      reply = completion.text || '';
      break;
    }

    if (!completion.toolCalls.length) {
      reply = completion.text;
      break;
    }

    turns.push({ role: 'assistant', text: completion.text, toolCalls: completion.toolCalls });
    if (completion.text.trim()) {
      await prisma.aIMessage.create({
        data: { conversationId: conversation.id, role: 'ASSISTANT', content: completion.text },
      });
    }

    const results = [];
    for (const call of completion.toolCalls) {
      const run = await runTool(call.name, call.input, { conversationId: conversation.id });

      /* Anything a search surfaced becomes a card in the widget. Collected
         here rather than parsed out of the model's prose, so a card always
         reflects the database row and never the model's retelling of it. */
      if (!run.isError) {
        try {
          const parsed = JSON.parse(run.content) as { products?: unknown[]; product?: unknown };
          if (Array.isArray(parsed.products)) products.push(...parsed.products);
          else if (parsed.product) products.push(parsed.product);
        } catch {
          /* A tool that returned unparseable JSON is still fine for the
             model; it just contributes no cards. */
        }
      }

      await prisma.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'TOOL',
          content: run.content.slice(0, 20_000),
          toolName: run.name,
          /* Prisma's Json input type does not accept a bare index signature;
             the value is plain JSON by construction. */
          metadata: { input: call.input, isError: run.isError, ms: run.ms } as Prisma.InputJsonValue,
        },
      });

      results.push({ toolCallId: call.id, content: run.content, isError: run.isError });
    }

    turns.push({ role: 'tool', results });

    /* Out of iterations with tools still pending: answer with what we have
       rather than billing another round. */
    if (iteration === env.AI_MAX_TOOL_ITERATIONS - 1) {
      reply = completion.text || '';
    }
  }

  if (!reply.trim()) {
    reply =
      "I don't have confirmed information about that yet. I can connect you with the WIN WEARS team for an accurate answer.";
    escalate = true;
  }

  await prisma.aIMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'ASSISTANT',
      content: reply,
      tokensIn: inputTokens,
      tokensOut: outputTokens,
    },
  });

  const updated = await prisma.aIConversation.update({
    where: { id: conversation.id },
    data: {
      messageCount: { increment: 1 },
      tokensUsed: { increment: inputTokens + outputTokens },
      lastMessageAt: new Date(),
      ...(escalate && !conversation.escalatedAt ? { escalatedAt: new Date() } : {}),
    },
  });

  await prisma.aIEvent.create({
    data: { conversationId: conversation.id, eventType: 'MESSAGE_SENT' },
  });

  /* De-duplicate by slug: several tools in one turn often return the same
     ball, and the widget should show it once. */
  const seen = new Set<string>();
  const cards = products.filter((p) => {
    const slug = (p as { slug?: string })?.slug;
    if (!slug || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });

  return {
    sessionId: updated.sessionId,
    reply,
    products: cards.slice(0, 4),
    escalate,
    conversationId: updated.id,
  };
}

export { AIProviderError };
