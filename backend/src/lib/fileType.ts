/**
 * Upload validation by content, not by claim.
 *
 * A browser-supplied MIME type and a file extension are both attacker-chosen.
 * The only trustworthy signal is the leading bytes, so every upload is sniffed
 * and anything outside the allow-list is rejected before it reaches storage.
 */
import { unsupportedMedia } from './errors';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_DOC_TYPES = ['application/pdf'] as const;
export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES] as const;

export type AllowedType = (typeof ALLOWED_UPLOAD_TYPES)[number];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/** Returns the real media type, or null when the bytes match nothing allowed. */
export function sniffType(buf: Buffer): AllowedType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  /* RIFF....WEBP */
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/**
 * Sniffs `buffer` and throws unless it is one of `allowed`.
 *
 * The returned type — not the uploaded one — is what gets stored, so a `.php`
 * named `photo.jpg` cannot survive as anything but a rejected request.
 */
export function assertAllowed(
  buffer: Buffer,
  allowed: readonly string[] = ALLOWED_UPLOAD_TYPES,
): AllowedType {
  const actual = sniffType(buffer);
  if (!actual || !allowed.includes(actual)) {
    const names = allowed.map((t) => t.split('/')[1]?.toUpperCase()).join(', ');
    throw unsupportedMedia(`That file type is not allowed. Accepted formats: ${names}.`);
  }
  return actual;
}
