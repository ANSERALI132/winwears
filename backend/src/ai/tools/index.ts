/**
 * Tool registry and executor.
 *
 * The single gate between the model and the database. A name the registry
 * does not hold cannot run; arguments that fail their schema never reach a
 * query. Both failures are reported back to the model as ordinary tool
 * results so it can correct itself — a customer should never see a stack
 * trace because the model guessed a parameter.
 */
import {
  compareProducts,
  getProduct,
  getProductFeatures,
  getProductSpecifications,
  searchCategories,
  searchProducts,
} from './catalogue';
import { createQuoteRequest, rememberRequirements } from './quote';
import { escalateToHuman, generateWhatsappLink } from './handoff';
import type { AIToolDefinition } from '../provider';
import type { AnyAITool, ToolContext } from './types';

/* Order is fixed and alphabetical-by-purpose rather than incidental: the tool
   list is part of the cached prompt prefix, so a stable order is a cache hit
   and a reshuffle is a silent cache miss on every conversation. */
const REGISTRY: Record<string, AnyAITool> = {
  search_products: searchProducts as AnyAITool,
  get_product: getProduct as AnyAITool,
  compare_products: compareProducts as AnyAITool,
  search_categories: searchCategories as AnyAITool,
  get_product_features: getProductFeatures as AnyAITool,
  get_product_specifications: getProductSpecifications as AnyAITool,
  remember_requirements: rememberRequirements as AnyAITool,
  create_quote_request: createQuoteRequest as AnyAITool,
  generate_whatsapp_link: generateWhatsappLink as AnyAITool,
  escalate_to_human: escalateToHuman as AnyAITool,
};

/** What the provider advertises to the model. */
export const toolDefinitions: AIToolDefinition[] = Object.values(REGISTRY).map((t) => t.definition);

export const toolNames = Object.keys(REGISTRY);

export interface ToolRun {
  name: string;
  /** JSON, ready to hand back as a tool result. */
  content: string;
  isError: boolean;
  /** Milliseconds, for the cost and latency picture in the admin dashboard. */
  ms: number;
}

/**
 * Runs one tool call.
 *
 * Never throws. A thrown database error would abort the customer's whole
 * message; returning it as a tool error lets the model apologise for the one
 * fact it could not fetch and carry on with the rest.
 */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolRun> {
  const started = Date.now();
  const tool = Object.prototype.hasOwnProperty.call(REGISTRY, name) ? REGISTRY[name] : undefined;

  if (!tool) {
    return {
      name,
      content: JSON.stringify({ error: `No tool named "${name}". Available: ${toolNames.join(', ')}.` }),
      isError: true,
      ms: Date.now() - started,
    };
  }

  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return {
      name,
      content: JSON.stringify({ error: 'Invalid arguments.', issues }),
      isError: true,
      ms: Date.now() - started,
    };
  }

  try {
    const result = await tool.run(parsed.data as never, ctx);
    return { name, content: JSON.stringify(result), isError: false, ms: Date.now() - started };
  } catch (err) {
    /* Diagnostics to the server log, never to the model — a Prisma error can
       carry column names and connection details. */
    console.error(`AI tool "${name}" failed:`, err);
    return {
      name,
      content: JSON.stringify({
        error: 'That lookup failed. Tell the customer the information is temporarily unavailable and offer the WIN WEARS team.',
      }),
      isError: true,
      ms: Date.now() - started,
    };
  }
}

export * from './types';
