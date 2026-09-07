/**
 * Password handling and the shape of an authenticated session.
 *
 * bcryptjs rather than argon2: it is pure JavaScript, so `npm install` cannot
 * fail on a machine without a C++ toolchain. The cost factor below is the
 * knob to raise as hardware gets faster.
 */
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    user?: SessionUser;
    /** Double-submit token compared against the X-CSRF-Token header. */
    csrfToken?: string;
  }
}
