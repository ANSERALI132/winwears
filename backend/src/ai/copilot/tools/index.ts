/**
 * Copilot tool registry and executor.
 *
 * The same gate the customer agent uses, with a different set behind it. The
 * model never composes a query: it picks a name and supplies arguments, which
 * are validated against a Zod schema before anything touches the database.
 *
 * Every tool here is a lookup. There is no write tool, and that is deliberate
 * rather than unfinished — an assistant that can cancel an order on a misread
 * question is a different class of risk from one that can only be wrong out
 * loud. Adding an action later means adding it here, with its own
 * confirmation, not loosening this.
 */
import { findCustomer, getOrder, pipelineSummary, revenueSummary, searchOrders } from './sales';
import { businessSnapshot, productionStatus, qualitySummary, shippingStatus, stockLevels } from './factory';
import type { AIToolDefinition } from '../../provider';
import type { AnyAITool } from '../../tools/types';

/* Stable order: the tool list is part of the cached prompt prefix, so
   reshuffling it is a silent cache miss on every thread. */
const REGISTRY: Record<string, AnyAITool> = {
  business_snapshot: businessSnapshot as AnyAITool,
  search_orders: searchOrders as AnyAITool,
  get_order: getOrder as AnyAITool,
  find_customer: findCustomer as AnyAITool,
  pipeline_summary: pipelineSummary as AnyAITool,
  revenue_summary: revenueSummary as AnyAITool,
  production_status: productionStatus as AnyAITool,
  quality_summary: qualitySummary as AnyAITool,
  stock_levels: stockLevels as AnyAITool,
  shipping_status: shippingStatus as AnyAITool,
};

export const copilotToolDefinitions: AIToolDefinition[] = Object.values(REGISTRY).map((t) => t.definition);
export const copilotToolNames = Object.keys(REGISTRY);

export interface CopilotToolRun {
  name: string;
  input: unknown;
  content: string;
  isError: boolean;
  ms: number;
}

/**
 * Runs one tool call. Never throws.
 *
 * A thrown database error would abort the whole question; returned as a tool
 * error, the model can say which fact it could not fetch and answer the rest.
 */
export async function runCopilotTool(name: string, input: unknown): Promise<CopilotToolRun> {
  const started = Date.now();
  const tool = Object.prototype.hasOwnProperty.call(REGISTRY, name) ? REGISTRY[name] : undefined;

  if (!tool) {
    return {
      name,
      input,
      content: JSON.stringify({ error: `No tool named "${name}". Available: ${copilotToolNames.join(', ')}.` }),
      isError: true,
      ms: Date.now() - started,
    };
  }

  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    return {
      name,
      input,
      content: JSON.stringify({ error: 'Invalid arguments.', issues }),
      isError: true,
      ms: Date.now() - started,
    };
  }

  try {
    /* The context the customer tools take is meaningless here — a copilot
       tool never writes, so there is no record for it to write against. */
    const result = await tool.run(parsed.data as never, { conversationId: null });
    return { name, input: parsed.data, content: JSON.stringify(result), isError: false, ms: Date.now() - started };
  } catch (err) {
    /* Diagnostics to the server log, never to the model: a Prisma error can
       carry column names and connection details. */
    console.error(`Copilot tool "${name}" failed:`, err);
    return {
      name,
      input,
      content: JSON.stringify({ error: 'That lookup failed. Say which figure you could not fetch and answer the rest.' }),
      isError: true,
      ms: Date.now() - started,
    };
  }
}
