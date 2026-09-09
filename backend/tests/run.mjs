/**
 * Runs every *.test.mjs in this folder, in order, and reports.
 *
 * Each file is its own process: they touch the same database, and a suite
 * that crashes should not take the rest down with it or leave a Prisma client
 * open for the next one.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const files = fs
  .readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

if (!files.length) {
  console.error('No test files found.');
  process.exit(2);
}

const results = [];

for (const file of files) {
  console.log(`\n${'─'.repeat(46)}\n  ${file}\n${'─'.repeat(46)}`);

  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], {
      stdio: 'inherit',
      cwd: path.resolve(here, '..'),
      env: process.env,
    });
    child.on('exit', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });

  results.push({ file, code });
}

console.log(`\n${'═'.repeat(46)}\n  SUITES\n${'═'.repeat(46)}`);
for (const r of results) {
  console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'}  ${r.file}`);
}

const failed = results.filter((r) => r.code !== 0);
console.log(`\n  ${results.length - failed.length}/${results.length} suites passed\n`);
process.exit(failed.length ? 1 : 0);
