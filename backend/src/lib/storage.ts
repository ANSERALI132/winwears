/**
 * Storage abstraction.
 *
 * Images never go into Postgres. Everything the rest of the codebase needs is
 * `put` and `remove`; swapping local disk for Cloudinary, S3, Supabase Storage
 * or Vercel Blob is then an env change plus one driver, with no call-site edits.
 *
 * Only the local driver ships wired up, because it is the only one that needs
 * no account. The others are stubs that name the exact package and call to add
 * — deliberately not guessed at, so nobody ships an untested upload path.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env';
import { ApiError } from './errors';

export interface StoredFile {
  /** Public URL the browser can load. */
  url: string;
  /** Handle used to delete the object later. */
  key: string;
  bytes: number;
  contentType: string;
}

export interface StorageDriver {
  readonly name: string;
  put(input: { buffer: Buffer; filename: string; contentType: string; prefix?: string }): Promise<StoredFile>;
  remove(key: string): Promise<void>;
}

/** `logo.final.PNG` -> `1a2b3c4d-logo-final.png`, with the extension trusted
 *  only after the caller has sniffed the real bytes. */
function safeName(filename: string, contentType: string): string {
  const ext = EXTENSION_BY_TYPE[contentType] ?? 'bin';
  const stem = path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'file';
  return `${crypto.randomUUID().slice(0, 8)}-${stem}.${ext}`;
}

export const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/* --------------------------------------------------------------- local ---- */

class LocalDriver implements StorageDriver {
  readonly name = 'local';

  private root = path.isAbsolute(env.STORAGE_LOCAL_DIR)
    ? env.STORAGE_LOCAL_DIR
    : path.resolve(__dirname, '..', '..', env.STORAGE_LOCAL_DIR);

  async put(input: { buffer: Buffer; filename: string; contentType: string; prefix?: string }): Promise<StoredFile> {
    const prefix = (input.prefix ?? 'misc').replace(/[^a-z0-9/-]/gi, '');
    const name = safeName(input.filename, input.contentType);
    const dir = path.join(this.root, prefix);
    await fs.mkdir(dir, { recursive: true });

    const key = path.posix.join(prefix, name);
    await fs.writeFile(path.join(this.root, key), input.buffer);

    return {
      url: `${env.STORAGE_PUBLIC_PATH}/${key}`,
      key,
      bytes: input.buffer.byteLength,
      contentType: input.contentType,
    };
  }

  async remove(key: string): Promise<void> {
    /* A key comes out of our own database, but resolving it and checking that
       it stayed inside the upload root costs nothing and removes any chance
       that a crafted value reaches unlink() with a traversal in it. */
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) return;
    await fs.rm(target, { force: true });
  }
}

/* ------------------------------------------------------------- remote ----- */

class UnconfiguredDriver implements StorageDriver {
  constructor(
    readonly name: string,
    private readonly howTo: string,
  ) {}

  private fail(): never {
    throw new ApiError(
      501,
      'STORAGE_NOT_IMPLEMENTED',
      `The "${this.name}" storage driver is not wired up yet. ${this.howTo}`,
    );
  }

  async put(): Promise<StoredFile> {
    this.fail();
  }

  async remove(): Promise<void> {
    this.fail();
  }
}

const DRIVERS: Record<string, () => StorageDriver> = {
  local: () => new LocalDriver(),
  cloudinary: () =>
    new UnconfiguredDriver(
      'cloudinary',
      'Install `cloudinary`, then implement put() with cloudinary.uploader.upload_stream({ folder: env.CLOUDINARY_FOLDER }) and remove() with cloudinary.uploader.destroy(key).',
    ),
  s3: () =>
    new UnconfiguredDriver(
      's3',
      'Install `@aws-sdk/client-s3`, then implement put() with PutObjectCommand and remove() with DeleteObjectCommand against env.S3_BUCKET.',
    ),
  supabase: () =>
    new UnconfiguredDriver(
      'supabase',
      'Install `@supabase/supabase-js`, then implement put() with storage.from(env.SUPABASE_BUCKET).upload() and remove() with .remove([key]).',
    ),
  'vercel-blob': () =>
    new UnconfiguredDriver(
      'vercel-blob',
      'Install `@vercel/blob`, then implement put() with put(name, buffer, { access: "public" }) and remove() with del(url).',
    ),
};

export const storage: StorageDriver = (DRIVERS[env.STORAGE_PROVIDER] ?? DRIVERS.local!)();
