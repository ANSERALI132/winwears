/**
 * Runs a command with the project-root .env loaded.
 *
 * The application reads ../.env deliberately: one file holds the project's
 * secrets, not one per package. The Prisma CLI has no such notion — it looks
 * only beside the schema or in the working directory — so without this wrapper
 * DATABASE_URL would have to be copied into a second .env, giving the
 * credential two homes and two chances to drift or leak.
 *
 *   node scripts/with-env.mjs prisma migrate dev
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

/* Root first, then any backend-local .env, which wins for local overrides. */
dotenv.config({ path: path.resolve(here, '..', '..', '.env') });
dotenv.config({ path: path.resolve(here, '..', '.env') });

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('usage: node scripts/with-env.mjs <command> [args...]');
  process.exit(2);
}

/* Windows needs a shell to resolve the .cmd shims in node_modules/.bin, and a
   shell concatenates rather than escapes its arguments. Everything here comes
   from package.json scripts, never from a request — but "it is trusted today"
   is how injection bugs are born, so anything that could change the meaning of
   the command line is refused outright. */
const SHELL_METACHARACTERS = /[&|;<>^"`$(){}[\]!\n\r]/;

for (const arg of [command, ...args]) {
  if (SHELL_METACHARACTERS.test(arg)) {
    console.error(`refusing to run: argument contains shell metacharacters: ${arg}`);
    process.exit(2);
  }
}

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: path.resolve(here, '..'),
});

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
child.on('error', (err) => {
  console.error(`could not run "${command}": ${err.message}`);
  process.exit(1);
});
