/**
 * tsc only emits .ts files, so the admin dashboard's HTML, CSS and browser JS
 * would be missing from dist/. This copies them across after a build.
 */
import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, '..', 'src', 'admin', 'public');
const to = resolve(here, '..', 'dist', 'admin', 'public');

await mkdir(dirname(to), { recursive: true });
await cp(from, to, { recursive: true });

console.log(`Copied admin assets -> ${to}`);
