/**
 * The tools the assistant answers from.
 *
 * These run the real tool functions against the real database, because the
 * property worth checking is not that the code compiles — it is that a draft
 * product cannot be reached, that a slug the model invented writes nothing,
 * and that two conversations cannot write into each other.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, describe, done, prisma, skip, summary } from './harness.mjs';

const require = createRequire(import.meta.url);
/* fileURLToPath, not URL.pathname: this project lives in a directory with a
   space in its name, and pathname hands back "WIN%20WEARS". */
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist') + path.sep;
const { runTool, toolNames } = require(`${dist}ai/tools/index.js`);
const { scoreLead } = require(`${dist}lib/leadScore.js`);
const { handoffMessage, handoffLink } = require(`${dist}lib/whatsapp.js`);
const { ESCALATION_LINE } = require(`${dist}ai/tools/handoff.js`);

const json = (r) => JSON.parse(r.content);
/* Companies are in here because submitting a quote resolves the customer to
   an account — the tool creates one as a side effect, and a test that leaves
   a company behind on every run is a test that pollutes the CRM. */
const made = { conversations: [], quotes: [], knowledge: [], companies: [] };
const NO_CTX = { conversationId: null };

async function newConversation(data = {}) {
  const c = await prisma.aIConversation.create({
    data: { sessionId: `test-${Math.random().toString(36).slice(2)}`, ...data },
  });
  made.conversations.push(c.id);
  return c;
}

/* -------------------------------------------------------------- catalogue */

describe('catalogue tools');

check('all twelve tools are registered', toolNames.length === 12, toolNames.join(','));

const published = await prisma.product.count({ where: { status: 'PUBLISHED', deletedAt: null } });
const all = json(await runTool('search_products', { limit: 12 }, NO_CTX));
check('search returns products', Array.isArray(all.products) && all.products.length > 0);
check('and its total matches the database', all.matched === published, `tool=${all.matched} db=${published}`);

const first = all.products[0];
check('products are addressed by slug, not database id', Boolean(first?.slug) && !('id' in (first ?? {})));
check('the product URL points at the real page', String(first?.url).includes('/product.html?slug='), first?.url);

const raw = JSON.stringify(all);
for (const field of ['"id"', 'status', 'deletedAt', 'internalNotes']) {
  check(`no ${field} in a search payload`, !raw.includes(field));
}

const one = json(await runTool('get_product', { slug: first.slug }, NO_CTX));
check('get_product finds it by slug', one.found === true);
check('unset columns are omitted rather than null', !JSON.stringify(one).includes(':null'));

const missing = json(await runTool('get_product', { slug: 'no-such-football-anywhere' }, NO_CTX));
check('an unknown slug is reported, not guessed at', missing.found === false);
check('and the model is told not to describe it from memory', /do not describe it from memory/i.test(missing.note ?? ''));

const empty = json(await runTool('search_products', { query: 'zzzz-not-a-real-ball' }, NO_CTX));
check('no matches returns a note rather than a product', empty.matched === 0 && /do not invent/i.test(empty.note ?? ''));

/* ------------------------------------------------------------- invisible */

describe('what the site hides, the assistant cannot see');

const hidden = await prisma.product.findFirst({
  where: { OR: [{ status: { not: 'PUBLISHED' } }, { NOT: { deletedAt: null } }] },
  select: { slug: true, sku: true, status: true },
});

if (!hidden) {
  skip('unpublished product is unreachable', 'every product is currently published');
} else {
  const bySlug = json(await runTool('get_product', { slug: hidden.slug }, NO_CTX));
  check(`get_product refuses a ${hidden.status} slug`, bySlug.found === false);
  const bySku = json(await runTool('get_product', { sku: hidden.sku }, NO_CTX));
  check('get_product refuses it by SKU too', bySku.found === false);
  const searched = json(await runTool('search_products', { query: hidden.sku }, NO_CTX));
  check('search cannot surface it by exact SKU', searched.matched === 0, `matched=${searched.matched}`);
  const compared = json(await runTool('compare_products', { slugs: [hidden.slug, first.slug] }, NO_CTX));
  check('compare_products excludes it', (compared.missing ?? []).includes(hidden.slug));
}

/* ------------------------------------------------------------- the gate */

describe('the executor is the only way in');

const bogus = await runTool('drop_all_tables', {}, NO_CTX);
check('an unregistered tool name cannot run', bogus.isError === true);
check('and the refusal names the real tools', bogus.content.includes('search_products'));

const badArgs = await runTool('compare_products', { slugs: ['only-one'] }, NO_CTX);
check('arguments failing their schema never reach a query', badArgs.isError === true);

const injection = await runTool('search_products', { query: '\'; DROP TABLE "Product"; --' }, NO_CTX);
check('a SQL-shaped query is treated as a search term', injection.isError === false);
check('and the table is still there', (await prisma.product.count()) > 0);

const tsq = await runTool('search_faq', { query: 'shipping & payment | (terms:*)' }, NO_CTX);
check('tsquery operators do not break knowledge search', tsq.isError === false);

/* ------------------------------------------------------------------ rfq */

describe('recording a requirement');

const a = await newConversation();
const b = await newConversation();
const ctxA = { conversationId: a.id };
const ctxB = { conversationId: b.id };

await runTool('remember_requirements', { quantity: 500, country: 'Germany' }, ctxA);
const afterA = await prisma.aIConversation.findUnique({ where: { id: a.id } });
check('what the customer said is persisted', afterA.quantity === 500 && afterA.country === 'Germany');
check('and the lead score reacts', afterA.leadScore !== 'LOW', afterA.leadScore);

await runTool('remember_requirements', { size: '5' }, ctxA);
const merged = await prisma.aIConversation.findUnique({ where: { id: a.id } });
check('a later call merges rather than replaces', merged.quantity === 500 && merged.size === '5');

await Promise.all([
  runTool('remember_requirements', { company: 'Alpha FC' }, ctxA),
  runTool('remember_requirements', { company: 'Beta SC' }, ctxB),
]);
const [intA, intB] = await Promise.all([
  prisma.aIConversation.findUnique({ where: { id: a.id } }),
  prisma.aIConversation.findUnique({ where: { id: b.id } }),
]);
check('interleaved conversations do not write into each other (A)', intA.company === 'Alpha FC', intA.company);
check('interleaved conversations do not write into each other (B)', intB.company === 'Beta SC', intB.company);

const fakeSlug = json(await runTool('remember_requirements', { productSlug: 'not-a-real-ball' }, ctxA));
check('an invented slug records nothing', fakeSlug.saved === false);
check('and says why, so the model can search again', /did not match a published record/i.test(fakeSlug.note ?? ''));

const noCtx = json(await runTool('remember_requirements', { quantity: 1 }, NO_CTX));
check('no conversation means no write', noCtx.saved === false);

/* -------------------------------------------------------------- submit */

describe('submitting a quote request');

const needsEmail = await runTool('create_quote_request', { name: 'No Email' }, ctxA);
check('an email address is required', needsEmail.isError === true);

const product = await prisma.product.findFirst({
  where: { status: 'PUBLISHED', deletedAt: null },
  select: { id: true, slug: true },
});
const submitted = json(await runTool('create_quote_request', {
  name: 'Test Buyer', email: 'buyer@example.com', company: 'Alpha FC',
  country: 'Germany', quantity: 500, size: '5',
  customizationRequired: true, productSlug: product.slug,
}, ctxA));

check('the request is submitted', submitted.submitted === true);
check('with a readable reference', /^WW-RFQ-\d{4}-\d{4}$/.test(submitted.reference ?? ''), submitted.reference);
check('and the model is told not to promise a response time',
  /do not promise a response time/i.test(submitted.tellCustomer ?? ''));

const quote = await prisma.quoteRequest.findFirst({ where: { reference: submitted.reference } });
if (quote) made.quotes.push(quote.id);
if (quote?.companyId) made.companies.push(quote.companyId);
check('a real row exists', Boolean(quote));
check('and it was filed against a customer account', Boolean(quote?.companyId));
check('marked as coming from the assistant', quote?.source === 'AI_AGENT', quote?.source);
check('linked to the conversation', quote?.aiConversationId === a.id);
check('linked to the real product', quote?.productId === product.id);

const conv = await prisma.aIConversation.findUnique({ where: { id: a.id } });
check('the conversation becomes a qualified lead', conv.status === 'QUALIFIED', conv.status);
check('an event is recorded',
  Boolean(await prisma.aIEvent.findFirst({ where: { conversationId: a.id, eventType: 'QUOTE_SUBMITTED' } })));

const second = json(await runTool('create_quote_request', { name: 'Second', email: 'two@example.com' }, ctxB));
const secondRow = await prisma.quoteRequest.findFirst({ where: { reference: second.reference } });
if (secondRow) made.quotes.push(secondRow.id);
if (secondRow?.companyId) made.companies.push(secondRow.companyId);
check('references do not collide', second.reference !== submitted.reference);

/* ------------------------------------------------------------ escalation */

describe('handing over to a person');

check('the sentence customers see is fixed in code',
  ESCALATION_LINE === "I'd be happy to connect you with the WIN WEARS team for an accurate answer.");

const esc = await newConversation();
const escalated = json(await runTool('escalate_to_human',
  { reason: 'wants_to_negotiate', detail: 'asked for volume pricing' }, { conversationId: esc.id }));
check('escalation is recorded', escalated.escalated === true);
check('the model is told to stop, not to guess anyway',
  /do not attempt an answer anyway/i.test(escalated.tellCustomer ?? ''));
check('and is given no URL to mangle', !/https?:\/\//.test(JSON.stringify(escalated)));

const escRow = await prisma.aIConversation.findUnique({ where: { id: esc.id } });
check('the conversation is marked escalated', Boolean(escRow.escalatedAt));

const invented = await runTool('escalate_to_human', { reason: 'just_because' }, { conversationId: esc.id });
check('reasons are a closed list', invented.isError === true);

const converted = await newConversation({ status: 'CONVERTED' });
await runTool('escalate_to_human', { reason: 'shipping_terms' }, { conversationId: converted.id });
const still = await prisma.aIConversation.findUnique({ where: { id: converted.id } });
check('a late question does not drag a converted lead backwards', still.status === 'CONVERTED', still.status);

/* -------------------------------------------------------------- whatsapp */

describe('the WhatsApp handoff');

const full = handoffMessage(
  { quantity: 500, size: '5', customizationRequired: true, country: 'Germany' },
  { productName: 'Hybrid Pro', sku: 'WW-HYB-01' },
);
check('carries what the customer said', /Quantity: 500/.test(full) && /Country: Germany/.test(full));
check('renders an explicit no as information', /Customization: Yes/.test(full));

const sparse = handoffMessage({ quantity: 500, size: null, customizationRequired: null, country: null }, null);
check('omits what was never said', !/Size:|Country:|Customization:/.test(sparse));

const convWithPii = { quantity: 5, size: null, customizationRequired: null, country: null };
check('no internal identifiers travel', !/id|session|score/i.test(handoffMessage(convWithPii, null).replace(/assistant/gi, '')));

const link = handoffLink('https://wa.me/923706495974', full);
check('the link keeps the configured number', link.includes('wa.me/923706495974'));
check('with exactly one text parameter', (link.match(/[?&]text=/g) ?? []).length === 1);
check('and survives a round trip', decodeURIComponent(link.split('text=')[1]) === full);
check('an existing query string is replaced, not appended',
  (handoffLink('https://wa.me/1?text=old', 'new').match(/text=/g) ?? []).length === 1);
check('a javascript: setting produces no link at all', handoffLink('javascript:alert(1)', 'x') === null);
check('a setting that is not a URL produces no link', handoffLink('not a url', 'x') === null);
check('an absent setting produces no link', handoffLink(undefined, 'x') === null);

/* ------------------------------------------------------------- knowledge */

describe('business knowledge');

const startCount = await prisma.aIKnowledge.count();

const entry = await prisma.aIKnowledge.create({
  data: {
    title: 'Customization and branding',
    content: 'WIN WEARS prints customer logos and custom designs on the balls we manufacture.',
    category: 'customization', status: 'PUBLISHED', priority: 10,
  },
});
made.knowledge.push(entry.id);

const found = json(await runTool('search_faq', { query: 'can I put my company logo on the ball' }, NO_CTX));
check('a natural question finds the entry that answers it', found.found > 0, JSON.stringify(found).slice(0, 120));

const draft = await prisma.aIKnowledge.create({
  data: { title: 'Unpublished policy', content: 'Mentions unicorn certification.', status: 'DRAFT', priority: 99 },
});
made.knowledge.push(draft.id);
const leak = json(await runTool('search_faq', { query: 'unicorn certification' }, NO_CTX));
check('a draft entry is never retrieved', leak.found === 0);

await prisma.aIKnowledge.update({ where: { id: entry.id }, data: { status: 'DRAFT' } });
const gone = json(await runTool('search_faq', { query: 'can I put my company logo on the ball' }, NO_CTX));
check('unpublishing takes an answer back immediately', gone.found === 0);
check('and the model is told not to reason it out', /do not reason it out/i.test(gone.note ?? ''));

const business = json(await runTool('get_business_information', {}, NO_CTX));
check('contact details are available', Boolean(business.business?.Company));
check('operational settings are not', !/siteUrl|featuredLimit/i.test(JSON.stringify(business)));

/* ----------------------------------------------------------- lead score */

describe('lead scoring');

check('a bare enquiry is LOW', scoreLead({}) === 'LOW');
check('quantity alone is not enough to be HIGH', scoreLead({ quantity: 5000 }) === 'MEDIUM', scoreLead({ quantity: 5000 }));
check('a large order with contact details is URGENT',
  scoreLead({ quantity: 5000, email: 'a@b.c', whatsapp: '+1', company: 'X', country: 'Y', quoteSubmitted: true }) === 'URGENT');

/* -------------------------------------------------------------- cleanup */

describe('cleanup');

await prisma.quoteRequest.deleteMany({ where: { id: { in: made.quotes } } });
await prisma.aIKnowledge.deleteMany({ where: { id: { in: made.knowledge } } });
await prisma.aIConversation.deleteMany({ where: { id: { in: made.conversations } } });
/* Last, because the enquiries above reference them. */
await prisma.company.deleteMany({ where: { id: { in: made.companies } } });

check('every quote this run created is gone',
  (await prisma.quoteRequest.count({ where: { id: { in: made.quotes } } })) === 0);
check('every conversation this run created is gone',
  (await prisma.aIConversation.count({ where: { id: { in: made.conversations } } })) === 0);
check('every customer account this run created is gone',
  (await prisma.company.count({ where: { id: { in: made.companies } } })) === 0);
check('the knowledge base is back to the size it started',
  (await prisma.aIKnowledge.count()) === startCount);

await done(summary());
