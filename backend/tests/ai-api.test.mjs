/**
 * The HTTP surface, exercised as a stranger and then as an admin.
 *
 * Needs the server running. These are the checks that would notice if a route
 * were mounted without its guard, or if a validation schema were loosened.
 */
import { check, checkHttp, describe, done, prisma, req, signIn, skip, summary, serverIsUp } from './harness.mjs';

if (!(await serverIsUp())) {
  console.error('\nThe server is not answering. Start it with `npm start` and try again.\n');
  process.exit(2);
}

/* ------------------------------------------------------------ anonymous */

describe('the admin surface is closed to strangers');

for (const path of [
  '/api/admin/ai/stats',
  '/api/admin/ai/analytics',
  '/api/admin/ai/conversations',
  '/api/admin/ai/knowledge',
  '/api/admin/stats',
  '/api/admin/products',
]) {
  check(`GET ${path} refused`, (await req('GET', path)).status === 401);
}

check('POST /api/admin/ai/knowledge refused',
  (await req('POST', '/api/admin/ai/knowledge', { body: { title: 'x', content: 'y' } })).status === 401);

/* ---------------------------------------------------------------- chat */

describe('the public chat endpoint is bounded');

checkHttp('an empty message is refused',
  await req('POST', '/api/ai/chat', { body: { message: '' } }), 422);
checkHttp('a 50k message is refused',
  await req('POST', '/api/ai/chat', { body: { message: 'x'.repeat(50000) } }), 422);
checkHttp('a missing message is refused',
  await req('POST', '/api/ai/chat', { body: { productSlug: 'x' } }), 422);
checkHttp('a non-string message is refused',
  await req('POST', '/api/ai/chat', { body: { message: { nested: true } } }), 422);

const status = await req('GET', '/api/ai/status');
check('the status endpoint is public', status.status === 200);
for (const secret of ['claude', 'anthropic', 'sk-ant', 'sonnet', 'opus', 'provider']) {
  check(`the status payload never mentions "${secret}"`, !status.text.toLowerCase().includes(secret));
}

/* --------------------------------------------------------------- events */

describe('the event endpoint is a fixed list, not a writer');

const anySession = 'a'.repeat(32);
checkHttp('an unknown session is ignored rather than confirmed',
  await req('POST', '/api/ai/event', { body: { sessionId: anySession, event: 'CHAT_OPENED' } }), 204);
checkHttp('a short session id is refused',
  await req('POST', '/api/ai/event', { body: { sessionId: 'abc', event: 'CHAT_OPENED' } }), 422);

for (const event of ['DROP_TABLES', 'QUOTE_SUBMITTED', 'HUMAN_ESCALATION', 'CONVERSATION_COMPLETED']) {
  checkHttp(`a browser cannot record ${event}`,
    await req('POST', '/api/ai/event', { body: { sessionId: anySession, event } }), 422);
}

check('no orphan events were written', (await prisma.aIEvent.count({ where: { conversationId: null } })) === 0);

/* --------------------------------------------------------------- public */

describe('the public catalogue leaks nothing');

const products = await req('GET', '/api/products?perPage=200');
for (const field of ['"status"', 'deletedAt', 'internalNotes']) {
  check(`no ${field} in the public product payload`, !products.text.includes(field));
}

/* ---------------------------------------------------------------- admin */

const session = await signIn();

if (!session?.cookie) {
  skip('admin endpoint checks', 'could not sign in — set ADMIN_EMAIL and ADMIN_PASSWORD');
} else {
  describe('signed in as an admin');

  const { cookie, csrf } = session;
  check('a CSRF token is issued on sign-in', Boolean(csrf));

  const stats = await req('GET', '/api/admin/ai/stats', { cookie });
  check('AI stats load', stats.status === 200, `status ${stats.status} ${stats.error ?? stats.text.slice(0, 120)}`);
  check('with conversation counts', typeof stats.data?.data?.conversations?.total === 'number',
    JSON.stringify(stats.data)?.slice(0, 120));
  check('and escalation reasons', Array.isArray(stats.data?.data?.escalationReasons));

  const analytics = await req('GET', '/api/admin/ai/analytics?days=30', { cookie });
  check('analytics load', analytics.status === 200);
  check('with a four-stage funnel', analytics.data?.data?.funnel?.length === 4);
  check('and one series point per day', analytics.data?.data?.series?.length === 30);
  check('an absurd period is refused', (await req('GET', '/api/admin/ai/analytics?days=9999', { cookie })).status === 422);

  const list = await req('GET', '/api/admin/ai/conversations', { cookie });
  check('conversations list', list.status === 200);
  check('session ids never reach the browser', !/"sessionId":"/.test(list.text));
  check('an invalid status filter is refused',
    (await req('GET', '/api/admin/ai/conversations?status=NOPE', { cookie })).status === 422);

  describe('CSRF protects every admin write');

  check('a write without the token is refused',
    (await req('POST', '/api/admin/ai/knowledge', { cookie, body: { title: 'x', content: 'y' } })).status === 403);

  const created = await req('POST', '/api/admin/ai/knowledge', {
    cookie,
    headers: { 'X-CSRF-Token': csrf },
    body: { title: 'Test entry', content: 'Temporary.', status: 'DRAFT', priority: 1 },
  });
  check('a write with the token succeeds', created.status === 201);

  const id = created.data?.data?.id;
  if (id) {
    check('an empty entry is refused', (await req('POST', '/api/admin/ai/knowledge', {
      cookie, headers: { 'X-CSRF-Token': csrf }, body: { title: '', content: '' },
    })).status === 422);

    const del = await req('DELETE', `/api/admin/ai/knowledge/${id}`, { cookie, headers: { 'X-CSRF-Token': csrf } });
    check('and it can be deleted again', del.status === 204);
    check('after which it is gone', (await req('GET', `/api/admin/ai/knowledge/${id}`, { cookie })).status === 404);
  }

  await req('POST', '/api/auth/logout', { cookie, headers: { 'X-CSRF-Token': csrf }, body: {} });
  check('signing out revokes the session',
    (await req('GET', '/api/admin/ai/stats', { cookie })).status === 401);
}

await done(summary());
