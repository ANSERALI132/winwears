/**
 * The Copilot loop.
 *
 * Takes one question from a signed-in admin and returns one answer, running
 * whatever lookups the model asks for in between and writing the whole
 * exchange — tool calls included — so somebody can later see exactly which
 * facts an answer was built from. That transcript is the point: a figure
 * nobody can trace is the failure this module exists to avoid.
 *
 * A thread belongs to one admin. Every read is scoped by userId, so one
 * person's question about margins never surfaces on a colleague's screen.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { env } from '../../env';
import { aiProvider } from '../index';
import { AIProviderError, type AITurn } from '../provider';
import { buildCopilotPrompt } from './prompt';
import { copilotToolDefinitions, runCopilotTool } from './tools';

/**
 * How many past messages are replayed.
 *
 * The API is stateless, so the thread is re-sent every turn and billed for it
 * every turn. Twenty is roughly ten exchanges — enough that "and last month?"
 * still refers to the figure discussed above, without paying for the start of
 * a long thread on every question.
 */
const HISTORY_WINDOW = 20;

/** Long enough for a paragraph and a small table. A copilot answer that runs
 *  to a page has not answered the question. */
const MAX_TOKENS = 1200;

export class CopilotUnavailable extends Error {
  readonly reason: 'disabled' | 'limit' | 'provider';
  constructor(message: string, reason: CopilotUnavailable['reason']) {
    super(message);
    this.name = 'CopilotUnavailable';
    this.reason = reason;
  }
}

export interface CopilotAnswer {
  threadId: string;
  reply: string;
  /** What was looked up, so the screen can show it under the answer. */
  usedTools: Array<{ name: string; ms: number; isError: boolean }>;
}

/** First line of the first question, so a list of threads reads as questions
 *  rather than as timestamps. */
function titleFrom(question: string): string {
  const line = question.trim().split(/\r?\n/)[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 77)}…` : line || 'Untitled';
}

async function loadTurns(threadId: string): Promise<AITurn[]> {
  const rows = await prisma.copilotMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_WINDOW,
  });

  /* Only the visible exchange is replayed. Tool results are not: they can be
     large, they are already reflected in the answer that followed, and paying
     to re-send a stock ledger on every subsequent question is waste. */
  return rows
    .reverse()
    .filter((m) => m.role === 'USER' || m.role === 'ASSISTANT')
    .map((m): AITurn =>
      m.role === 'USER'
        ? { role: 'user', text: m.content }
        : { role: 'assistant', text: m.content, toolCalls: [] },
    );
}

export async function askCopilot(input: {
  userId: string;
  userName: string;
  userRole: string;
  threadId?: string;
  question: string;
}): Promise<CopilotAnswer> {
  if (!aiProvider.configured) {
    throw new CopilotUnavailable(
      'The copilot is not configured. Set AI_API_KEY in the environment to switch it on.',
      'disabled',
    );
  }

  /* Threads are looked up by id *and* owner: a guessed id belonging to
     somebody else must miss, not read. */
  let thread = input.threadId
    ? await prisma.copilotThread.findFirst({ where: { id: input.threadId, userId: input.userId } })
    : null;

  if (!thread) {
    thread = await prisma.copilotThread.create({
      data: { userId: input.userId, title: titleFrom(input.question) },
    });
  }

  if (thread.messageCount >= env.AI_MAX_MESSAGES_PER_CONVERSATION) {
    throw new CopilotUnavailable('This thread has reached its length limit. Start a new one.', 'limit');
  }

  const history = await loadTurns(thread.id);
  const turns: AITurn[] = [...history, { role: 'user', text: input.question }];
  const system = buildCopilotPrompt({ name: input.userName, role: input.userRole }, new Date());

  const started = Date.now();
  let reply = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const usedTools: CopilotAnswer['usedTools'] = [];
  const toolLog: Array<{ name: string; input: unknown; result: string; ms: number; isError: boolean }> = [];

  try {
    for (let iteration = 0; iteration < env.AI_MAX_TOOL_ITERATIONS; iteration += 1) {
      const completion = await aiProvider.complete({
        system,
        turns,
        tools: copilotToolDefinitions,
        maxTokens: MAX_TOKENS,
      });

      inputTokens += completion.usage.inputTokens;
      outputTokens += completion.usage.outputTokens;

      if (completion.stopReason === 'refusal') {
        reply = completion.text || 'I cannot answer that one.';
        break;
      }

      if (!completion.toolCalls.length) {
        reply = completion.text || '';
        break;
      }

      turns.push({ role: 'assistant', text: completion.text, toolCalls: completion.toolCalls });

      const results = [];
      for (const call of completion.toolCalls) {
        const run = await runCopilotTool(call.name, call.input);
        usedTools.push({ name: run.name, ms: run.ms, isError: run.isError });
        toolLog.push({ name: run.name, input: run.input, result: run.content, ms: run.ms, isError: run.isError });
        results.push({ toolCallId: call.id, content: run.content, isError: run.isError });
      }
      turns.push({ role: 'tool', results });

      /* Out of iterations with tools still pending: answer with what is in
         hand rather than billing another round. */
      if (iteration === env.AI_MAX_TOOL_ITERATIONS - 1) reply = completion.text || '';
    }
  } catch (err) {
    if (err instanceof AIProviderError) {
      console.error('Copilot provider error:', err.cause ?? err.message);
      throw new CopilotUnavailable(
        'The copilot could not reach its provider. Nothing has been changed — try again shortly.',
        'provider',
      );
    }
    throw err;
  }

  if (!reply.trim()) {
    reply = 'I could not put an answer together for that. Try asking it a different way, or narrow it to one order or one period.';
  }

  const latencyMs = Date.now() - started;

  await prisma.$transaction([
    prisma.copilotMessage.create({
      data: { threadId: thread.id, role: 'USER', content: input.question },
    }),
    prisma.copilotMessage.create({
      data: {
        threadId: thread.id,
        role: 'ASSISTANT',
        content: reply,
        toolCalls: toolLog.length ? (toolLog as unknown as Prisma.InputJsonValue) : undefined,
        inputTokens,
        outputTokens,
        latencyMs,
      },
    }),
    prisma.copilotThread.update({
      where: { id: thread.id },
      data: {
        messageCount: { increment: 2 },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
        lastMessageAt: new Date(),
      },
    }),
  ]);

  return { threadId: thread.id, reply, usedTools };
}
