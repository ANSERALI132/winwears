/**
 * Anthropic provider.
 *
 * The only file in the project that imports the vendor SDK. Its whole job is
 * translating between the neutral shapes in ../provider and the Messages API,
 * and turning every failure into an AIProviderError carrying nothing a
 * customer should not read.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  AIProviderError,
  type AICompletion,
  type AICompletionRequest,
  type AIProvider,
  type AIStopReason,
  type AITurn,
} from '../provider';

/** A real key starts with this. The repository ships a placeholder in
 *  .env.example, and treating that as configured would mean every customer's
 *  first message failed with a 401 instead of the WhatsApp fallback. */
const KEY_PREFIX = 'sk-ant-';

function toMessages(turns: AITurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.text });
      continue;
    }

    if (turn.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = [];
      /* An assistant turn that called a tool often has no prose with it, and
         the API rejects an empty content array. */
      if (turn.text.trim()) content.push({ type: 'text', text: turn.text });
      for (const call of turn.toolCalls) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      }
      if (content.length) messages.push({ role: 'assistant', content });
      continue;
    }

    /* Every result for one assistant turn must arrive in a single user
       message; splitting them teaches the model to stop calling tools in
       parallel. */
    messages.push({
      role: 'user',
      content: turn.results.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.toolCallId,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    });
  }

  return messages;
}

function toStopReason(reason: Anthropic.Message['stop_reason']): AIStopReason {
  switch (reason) {
    case 'end_turn':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model: string;
  readonly configured: boolean;

  private client: Anthropic | null = null;

  constructor(apiKey: string | undefined, model: string) {
    this.model = model;
    this.configured = Boolean(apiKey && apiKey.startsWith(KEY_PREFIX));
    if (this.configured) {
      this.client = new Anthropic({
        apiKey,
        /* The SDK retries 429s and 5xx twice by default. A customer is
           waiting on this, so fail over to a human sooner rather than
           spending thirty seconds on retries. */
        maxRetries: 1,
        timeout: 30_000,
      });
    }
  }

  async complete(request: AICompletionRequest): Promise<AICompletion> {
    if (!this.client) {
      throw new AIProviderError('The AI provider is not configured.');
    }

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens,
        /* The instructions are identical on every call and sit ahead of the
           conversation, so caching them turns the largest fixed cost of each
           message into a cache read. */
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        tools: request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: toMessages(request.turns),
      });
    } catch (err) {
      throw translate(err);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({
        id: b.id,
        name: b.name,
        /* Tool input arrives as parsed JSON; never string-match the raw form,
           escaping varies between models. */
        input: (b.input ?? {}) as Record<string, unknown>,
      }));

    return {
      text,
      toolCalls,
      stopReason: toStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

/** Vendor error -> our error. Messages here are for the server log; the route
 *  shows the customer the generic WhatsApp fallback either way. */
function translate(err: unknown): AIProviderError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new AIProviderError('AI credential rejected — check AI_API_KEY.', { cause: err });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AIProviderError('AI rate limit reached.', { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AIProviderError(`AI request rejected: ${err.message}`, { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AIProviderError('Could not reach the AI provider.', { retryable: true, cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    return new AIProviderError(`AI provider error ${err.status}.`, {
      retryable: typeof err.status === 'number' && err.status >= 500,
      cause: err,
    });
  }
  return new AIProviderError('Unexpected AI provider failure.', { cause: err });
}
