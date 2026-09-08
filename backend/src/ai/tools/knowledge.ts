/**
 * Knowledge tools.
 *
 * What the agent may say about the business, as opposed to about a football.
 * Both draw on admin-written records: search_faq on the knowledge base,
 * get_business_information on the same settings the site footer uses.
 *
 * Retrieval is Postgres full-text search, not vectors. pgvector is not
 * available on this server — it is not even in pg_available_extensions — and
 * §23 says to use semantic retrieval only where it earns its place. For a few
 * dozen admin-written policies, `english` full-text matching finds the right
 * entry and, unlike an embedding, an admin can predict what it will match.
 *
 * There is no GIN index yet, deliberately. The expression index this would
 * want cannot be expressed in the Prisma schema, so it would show as drift
 * and be dropped by the next `migrate diff`. At this table's size the scan is
 * immaterial; the note in the migration says when to revisit.
 */
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { getAllSettings } from '../../lib/settings';
import { compact, type AITool } from './types';

interface KnowledgeHit {
  id: string;
  title: string;
  content: string;
  category: string;
  rank: number;
}

const searchInput = z.object({
  query: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(5).default(3),
});

/**
 * Runs one retrieval pass.
 *
 * `strict` requires every word (plainto_tsquery); `loose` accepts any of them
 * and lets ranking sort it out. The loose query is assembled from the words
 * rather than passed through, and the words are reduced to letters and digits
 * first — so `to_tsquery`, which does interpret operators, only ever receives
 * terms that cannot be operators.
 */
async function search(query: string, limit: number, mode: 'strict' | 'loose'): Promise<KnowledgeHit[]> {
  const vector = Prisma.sql`(
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  )`;

  let tsquery: Prisma.Sql;
  if (mode === 'strict') {
    tsquery = Prisma.sql`plainto_tsquery('english', ${query})`;
  } else {
    const terms = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2);
    if (!terms.length) return [];
    tsquery = Prisma.sql`to_tsquery('english', ${terms.join(' | ')})`;
  }

  return prisma.$queryRaw<KnowledgeHit[]>`
    SELECT id, title, content, category, ts_rank(${vector}, ${tsquery}) AS rank
    FROM "AIKnowledge"
    WHERE status = 'PUBLISHED' AND ${vector} @@ ${tsquery}
    ORDER BY rank DESC, priority DESC, "updatedAt" DESC
    LIMIT ${limit}
  `;
}

export const searchFaq: AITool<z.infer<typeof searchInput>> = {
  definition: {
    name: 'search_faq',
    description:
      'Search WIN WEARS business knowledge: manufacturing, customization, shipping and payment policy, company information and frequently asked questions. Use this before answering anything about how WIN WEARS works, as opposed to what a football is made of. An empty result means the answer is not written down — say so and offer the team rather than reasoning it out.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "The customer's question, in their words" },
        limit: { type: 'integer', minimum: 1, maximum: 5, description: 'Default 3' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  schema: searchInput,
  async run(input) {
    /* Two passes, precision first.
     *
     * plainto_tsquery ANDs every word, so "can I put my company logo on the
     * ball" misses an entry that says "customer logos" — one absent word and
     * a perfectly good answer is never found, which for this agent means
     * escalating a question the business had already written down. So when
     * the strict pass finds nothing, retry with the words ORed and let
     * ts_rank order what comes back.
     *
     * Title is weighted A and body B in both passes, so an entry titled
     * "Shipping" beats one that mentions shipping in passing. */
    let hits = await search(input.query, input.limit, 'strict');
    if (!hits.length) hits = await search(input.query, input.limit, 'loose');

    if (!hits.length) {
      return {
        found: 0,
        note: 'Nothing on record answers that. Do not reason it out from general knowledge — say it is not confirmed and offer the WIN WEARS team.',
      };
    }

    return {
      found: hits.length,
      /* Fenced as quoted material. The content is admin-written and therefore
         trusted as fact, but it is still text arriving in the model's context,
         and the system prompt tells it that tool output is data. */
      entries: hits.map((h) => compact({ title: h.title, category: h.category, content: h.content })),
    };
  },
};

/* ------------------------------------------------------------ business --- */

const businessInput = z.object({});

/** Only the outward-facing settings. The agent has no business knowing the
 *  site URL, the featured-products limit, or anything else operational. */
const PUBLIC_KEYS: Array<[string, string]> = [
  ['company.name', 'Company'],
  ['company.tagline', 'Tagline'],
  ['contact.email', 'Email'],
  ['contact.phoneDisplay', 'Phone / WhatsApp'],
  ['social.facebook', 'Facebook'],
  ['social.instagram', 'Instagram'],
  ['social.linkedin', 'LinkedIn'],
];

export const getBusinessInformation: AITool<z.infer<typeof businessInput>> = {
  definition: {
    name: 'get_business_information',
    description:
      'WIN WEARS contact details and social links, as configured by the business. Use when a customer asks how to reach the company. These are confirmed and may be given out.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  schema: businessInput,
  async run() {
    const settings = await getAllSettings();
    const out: Record<string, string> = {};
    for (const [key, label] of PUBLIC_KEYS) {
      const value = settings[key];
      if (value && value.trim()) out[label] = value;
    }
    return { business: out };
  },
};
