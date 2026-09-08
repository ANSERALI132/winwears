/**
 * Provider selection.
 *
 * Resolved once at boot from the environment. Callers import `aiProvider` and
 * check `.configured` before starting work — an unconfigured agent is an
 * expected state here, not an error, because the site must run perfectly well
 * without one.
 */
import { env } from '../env';
import type { AIProvider } from './provider';
import { AnthropicProvider } from './providers/anthropic';
import { UnconfiguredProvider } from './providers/unconfigured';

function select(): AIProvider {
  if (!env.AI_ENABLED) {
    return new UnconfiguredProvider(env.AI_PROVIDER, env.AI_MODEL, 'AI_ENABLED is false');
  }

  if (env.AI_PROVIDER === 'anthropic') {
    const provider = new AnthropicProvider(env.AI_API_KEY, env.AI_MODEL);
    if (provider.configured) return provider;
    return new UnconfiguredProvider(
      'anthropic',
      env.AI_MODEL,
      env.AI_API_KEY ? 'AI_API_KEY is not a valid Anthropic key' : 'AI_API_KEY is not set',
    );
  }

  return new UnconfiguredProvider(env.AI_PROVIDER, env.AI_MODEL);
}

export const aiProvider = select();

/* One line at boot, so an operator learns the assistant is offline from the
   log rather than from a customer. Never prints the key. */
if (!aiProvider.configured && aiProvider instanceof UnconfiguredProvider) {
  console.warn(`AI assistant disabled: ${aiProvider.reason}. Customers will be offered WhatsApp instead.`);
}

export * from './provider';
