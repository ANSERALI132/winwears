/**
 * AI provider abstraction.
 *
 * The rest of the agent talks in these shapes and never imports a vendor SDK,
 * so swapping Anthropic for another provider is one new file plus an env
 * change — the tool layer, the chat route and the widget stay untouched.
 *
 * The shapes are deliberately the small common denominator of the chat-plus-
 * tools APIs rather than a mirror of any one of them: a turn is text, an
 * assistant turn may also carry tool calls, and tool results come back as
 * their own turn. Anything vendor-specific is the provider's problem.
 */

/** A tool the model may call. `inputSchema` is JSON Schema. */
export interface AIToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AIToolCall {
  /** Provider-issued id; the matching result must quote it back. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AIToolResult {
  toolCallId: string;
  /** Serialised result. Tools return JSON strings, not objects, so the
   *  provider never has to guess at an encoding. */
  content: string;
  isError?: boolean;
}

export type AITurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: AIToolCall[] }
  | { role: 'tool'; results: AIToolResult[] };

/** Why generation stopped. `refusal` is its own case because it needs the
 *  human-handoff path, not a retry. */
export type AIStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AICompletion {
  text: string;
  toolCalls: AIToolCall[];
  stopReason: AIStopReason;
  usage: AIUsage;
}

export interface AICompletionRequest {
  system: string;
  turns: AITurn[];
  tools: AIToolDefinition[];
  maxTokens: number;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** False when no usable credential is present. Callers check this instead
   *  of catching an auth error on the customer's first message. */
  readonly configured: boolean;
  complete(request: AICompletionRequest): Promise<AICompletion>;
}

/**
 * Raised when the provider itself fails — network, auth, rate limit, refusal.
 * Carries no vendor detail that could reach a customer; the chat route turns
 * it into the WhatsApp fallback and logs the cause server-side.
 */
export class AIProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}
