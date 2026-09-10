/**
 * Private file storage, for business documents.
 *
 * Deliberately separate from lib/storage.ts. That one holds product
 * photographs, which are meant to be seen by anybody and are served straight
 * off disk by express.static. A customer's artwork or a signed purchase order
 * is not that: it is read back only through an authenticated route, because
 * an unguessable URL is not the same thing as a private one — it is a
 * password that gets pasted into an email thread and forwarded.
 *
 * Only the local driver is implemented, the same as the public store. Doing
 * this against a bucket needs signed URLs or a streaming proxy, and guessing
 * at either would ship an untested path for somebody's confidential file.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env';
import { ApiError } from './errors';
import { EXTENSION_BY_TYPE } from './storage';

export interface StoredDocument {
  key: string;
  bytes: number;
  contentType: string;
}

const root = (): string =>
  path.isAbsolute(env.STORAGE_PRIVATE_DIR)
    ? env.STORAGE_PRIVATE_DIR
    : path.resolve(__dirname, '..', '..', env.STORAGE_PRIVATE_DIR);

/**
 * A key that cannot escape the directory.
 *
 * Keys are generated here, not supplied by anybody — but they travel through
 * the database and back, and one day somebody will add an endpoint that takes
 * one from a request. Resolving and then checking containment costs nothing
 * and means that day is not a breach.
 */
function resolveKey(key: string): string {
  const base = root();
  const full = path.resolve(base, key);
  const within = full === base || full.startsWith(base + path.sep);
  if (!within) throw new ApiError(400, 'BAD_REQUEST', 'That file path is not allowed.');
  return full;
}

/** `artwork.final.PDF` -> `2026/a1b2c3d4-artwork-final.pdf`. The extension
 *  comes from the sniffed content type, never from what was uploaded. */
function keyFor(filename: string, contentType: string): string {
  const ext = EXTENSION_BY_TYPE[contentType] ?? 'bin';
  const stem =
    path
      .basename(filename, path.extname(filename))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'file';
  /* Foldered by year so a directory listing stays navigable after a few
     thousand documents. */
  return `${new Date().getFullYear()}/${crypto.randomUUID().slice(0, 8)}-${stem}.${ext}`;
}

export async function putDocument(input: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<StoredDocument> {
  if (env.STORAGE_PROVIDER !== 'local') {
    throw new ApiError(
      501,
      'NOT_IMPLEMENTED',
      `Private documents are only implemented for local storage. STORAGE_PROVIDER is "${env.STORAGE_PROVIDER}", which would need signed URLs or a streaming proxy — not guessed at here.`,
    );
  }

  const key = keyFor(input.filename, input.contentType);
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, input.buffer);

  return { key, bytes: input.buffer.byteLength, contentType: input.contentType };
}

export async function readDocument(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

/** Whether a file exists for this key. Used by the health check to find rows
 *  whose file has gone, without reading megabytes to find out. */
export async function documentExists(key: string): Promise<boolean> {
  try {
    await fs.access(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

/**
 * Proves the store can actually be written to, then tidies up after itself.
 *
 * A disk that is full or a directory that is read-only is invisible until
 * somebody tries to attach a file to an order — which is the worst moment to
 * find out.
 */
export async function checkWritable(): Promise<{ ok: boolean; error?: string }> {
  const probe = path.join(root(), '.health-probe');
  try {
    await fs.mkdir(root(), { recursive: true });
    await fs.writeFile(probe, 'ok');
    const read = await fs.readFile(probe, 'utf8');
    await fs.unlink(probe);
    if (read !== 'ok') return { ok: false, error: 'what was written did not read back' };
    return { ok: true };
  } catch (err) {
    await fs.unlink(probe).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : 'could not write' };
  }
}

/** Best effort. A document row whose file has already gone should still be
 *  removable — otherwise a failed upload leaves a row nobody can clear. */
export async function removeDocument(key: string): Promise<void> {
  try {
    await fs.unlink(resolveKey(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[documents] could not remove', key, err);
    }
  }
}
