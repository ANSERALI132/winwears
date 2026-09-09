/**
 * The assistant's effective configuration.
 *
 * Three layers, in order: what an admin set in /admin, then the environment,
 * then a built-in default. That ordering is what lets someone change the
 * greeting or switch the assistant off without a deploy, while a server that
 * has never had its settings touched still behaves sensibly.
 *
 * The API key is not here and never will be. It is read from the environment
 * inside the provider, and nothing in this file — which is reachable from an
 * admin HTTP handler — can return it.
 */
import { env } from '../env';
import { getAllSettings } from './settings';

/** Models an admin may choose between. A fixed list rather than a free text
 *  box: a typo in a model id is a broken assistant, and the failure would
 *  only show up on a customer's next message. Current as of this build; the
 *  environment can still name anything if a new one appears. */
export const SELECTABLE_MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced (recommended)' },
  { id: 'claude-opus-5', label: 'Claude Opus 5 — most capable, ~2.5x the cost' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — cheapest and fastest' },
];

export interface AiConfig {
  enabled: boolean;
  greeting: string;
  subtitle: string;
  escalationMessage: string;
  extraInstructions: string;
  model: string;
  maxTokens: number;
}

function toInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function getAiConfig(): Promise<AiConfig> {
  const s = await getAllSettings();

  return {
    /* Both have to agree. AI_ENABLED=false is the operator's switch and an
       admin cannot override it from the browser; ai.enabled is the one they
       can reach, and is what "maintenance mode" means here. */
    enabled: env.AI_ENABLED && s['ai.enabled'] !== 'false',
    greeting: s['ai.greeting']?.trim() || 'How can we help?',
    subtitle:
      s['ai.subtitle']?.trim() || 'Ask about footballs, customization, bulk orders or request a quote.',
    escalationMessage:
      s['ai.escalationMessage']?.trim() ||
      "I'd be happy to connect you with the WIN WEARS team for an accurate answer.",
    extraInstructions: s['ai.extraInstructions']?.trim() ?? '',
    /* A model an admin chose, but only from the list — an unrecognised value
       in the database should not become a broken API call. */
    model: SELECTABLE_MODELS.some((m) => m.id === s['ai.model']) ? (s['ai.model'] as string) : env.AI_MODEL,
    maxTokens: s['ai.maxTokens'] ? toInt(s['ai.maxTokens'], env.AI_MAX_TOKENS, 128, 8192) : env.AI_MAX_TOKENS,
  };
}

/**
 * What the settings screen may show about the environment.
 *
 * Facts, not values: whether a key exists, never the key. Rate limits and the
 * conversation caps appear here read-only because they are wired into
 * middleware at boot — offering an admin a box that silently does nothing
 * until the next restart would be worse than telling them where it lives.
 */
export function getAiEnvironmentFacts() {
  return {
    provider: env.AI_PROVIDER,
    keyConfigured: Boolean(env.AI_API_KEY && env.AI_API_KEY.startsWith('sk-ant-')),
    envModel: env.AI_MODEL,
    envMaxTokens: env.AI_MAX_TOKENS,
    maxToolIterations: env.AI_MAX_TOOL_ITERATIONS,
    maxMessagesPerConversation: env.AI_MAX_MESSAGES_PER_CONVERSATION,
    maxInputChars: env.AI_MAX_INPUT_CHARS,
    rateLimitPerWindow: env.RATE_LIMIT_AI_MAX,
    rateLimitWindowMinutes: env.RATE_LIMIT_WINDOW_MINUTES,
  };
}
