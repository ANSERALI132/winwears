/**
 * Placeholder provider.
 *
 * Used when AI_PROVIDER names something this build cannot talk to, or when
 * the agent is switched off. It reports `configured: false` so callers take
 * the human-handoff path before spending a request, and it names the exact
 * work needed if someone does call it — same approach as the unimplemented
 * storage drivers, and for the same reason: an untested integration that
 * looks wired up is worse than one that says it is not.
 */
import { AIProviderError, type AICompletion, type AIProvider } from '../provider';

/** What each provider still needs, so the message is useful rather than a
 *  bare "not implemented". */
const TODO: Record<string, string> = {
  openai: 'install "openai" and add src/ai/providers/openai.ts implementing AIProvider via client.chat.completions.create with tools',
  none: 'set AI_PROVIDER=anthropic and supply AI_API_KEY',
};

export class UnconfiguredProvider implements AIProvider {
  readonly name: string;
  readonly model: string;
  readonly configured = false;

  /** Why this provider is inert — surfaced in the boot warning and the admin
   *  AI settings screen, never to a customer. */
  readonly reason: string;

  constructor(name: string, model: string, reason?: string) {
    this.name = name;
    this.model = model;
    this.reason = reason ?? TODO[name] ?? `no implementation for AI_PROVIDER "${name}"`;
  }

  async complete(): Promise<AICompletion> {
    throw new AIProviderError(`AI provider "${this.name}" is not configured: ${this.reason}`);
  }
}
