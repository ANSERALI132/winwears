/**
 * A very small test harness.
 *
 * No framework, deliberately. The project has one build step and no bundler,
 * and a runner that needs about eighty lines is not worth a dependency, a
 * config file and a plugin ecosystem. These are plain Node scripts.
 *
 * The tests talk to the real development database and the running server,
 * because what is worth checking here is that Prisma, Postgres, Express and
 * the tools agree with each other — which a mocked test cannot tell you.
 * Every test cleans up what it made.
 */
import { PrismaClient } from '@prisma/client';

export const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

/**
 * Refuses to run against anything that looks like production.
 *
 * These tests create and delete rows. Pointing them at a live database would
 * be a bad afternoon, and an environment variable is a thin thing to stand
 * between the two.
 */
function assertSafeDatabase() {
  const url = process.env.DATABASE_URL ?? '';
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
  if (!local && process.env.ALLOW_REMOTE_TEST_DB !== 'yes') {
    console.error(
      '\nRefusing to run: DATABASE_URL does not point at localhost.\n' +
        'These tests write and delete rows. If you really mean to run them\n' +
        'against a remote database, set ALLOW_REMOTE_TEST_DB=yes.\n',
    );
    process.exit(2);
  }
}

assertSafeDatabase();

export const prisma = new PrismaClient();

/* ------------------------------------------------------------- results --- */

const results = { pass: 0, fail: 0, skip: 0, failures: [] };
let suite = '';

export function describe(name) {
  suite = name;
  console.log(`\n== ${name} ==`);
}

export function check(label, condition, detail) {
  if (condition) {
    results.pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    results.fail += 1;
    results.failures.push(`${suite} › ${label}${detail ? `  <- ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? `  <- ${detail}` : ''}`);
  }
}

export function skip(label, why) {
  results.skip += 1;
  console.log(`  SKIP  ${label}${why ? `  (${why})` : ''}`);
}

/**
 * Asserts a status code, but skips when the AI rate limiter has already been
 * spent.
 *
 * /api/ai/chat and /api/ai/event share one tier of 20 requests per 15
 * minutes. Running this suite twice inside that window exhausts it, and every
 * validation check then sees a 429 instead of the 422 it expects. Failing
 * would be reporting a bug that is not there; passing regardless would be
 * claiming a check that did not run. So it skips and says why — and the
 * limiter is left exactly as strict as it is in production.
 */
export function checkHttp(label, res, expected, detail) {
  if (res.status === 429 && expected !== 429) {
    skip(label, 'AI rate limit already spent — wait for the window or restart the server');
    return;
  }
  check(label, res.status === expected, detail ?? `status ${res.status}`);
}

export function summary() {
  console.log('\n' + '='.repeat(46));
  console.log(`  PASSED ${results.pass}   FAILED ${results.fail}   SKIPPED ${results.skip}`);
  console.log('='.repeat(46));
  if (results.failures.length) {
    console.log('\nFailures:');
    results.failures.forEach((f) => console.log(`  - ${f}`));
  }
  return results.fail === 0;
}

/* ---------------------------------------------------------------- http --- */

/** Returns status and parsed body rather than throwing, so a test can assert
 *  on a 401 as easily as on a 200. */
export async function req(method, path, { body, headers, cookie } = {}) {
  const init = { method, headers: { ...(headers ?? {}) } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (cookie) init.headers.Cookie = cookie;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch (err) {
    return { status: 0, data: null, text: '', error: String(err) };
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* Static assets and 204s are not JSON; the caller can read .text. */
  }
  return { status: res.status, ok: res.ok, data, text, headers: res.headers };
}

/** Signs in and returns the cookie plus CSRF token every admin write needs. */
export async function signIn() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const file = path.resolve(process.cwd(), 'ADMIN-LOGIN.local.txt');
  if (!fs.existsSync(file)) return null;

  const text = fs.readFileSync(file, 'utf8');
  const email = /^\s*Email\s+(\S+)/m.exec(text)?.[1];
  const password = /^\s*Password\s+(\S+)/m.exec(text)?.[1];
  if (!email || !password) return null;

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;

  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const me = await req('GET', '/api/auth/me', { cookie });
  return { cookie, csrf: me.data?.data?.csrfToken };
}

export async function serverIsUp() {
  const r = await req('GET', '/api/health');
  return r.status === 200;
}

export async function done(ok) {
  await prisma.$disconnect();
  process.exitCode = ok ? 0 : 1;
}
