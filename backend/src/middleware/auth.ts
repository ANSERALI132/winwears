/**
 * Route guards and CSRF.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../db';
import { forbidden, unauthorized, ApiError } from '../lib/errors';
import type { SessionUser } from '../lib/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: SessionUser;
    }
  }
}

/**
 * Loads the signed-in user onto the request.
 *
 * The account is re-read from the database on every request rather than
 * trusted from the session blob, so deactivating or demoting somebody takes
 * effect on their next click instead of when their session happens to expire.
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const id = req.session?.userId;
  if (!id) return next();
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!user || !user.active) {
      req.session.destroy(() => undefined);
      return next();
    }
    req.admin = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.admin) return next(unauthorized());
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.admin) return next(unauthorized());
    if (!roles.includes(req.admin.role)) {
      return next(forbidden('That action needs an administrator account.'));
    }
    next();
  };
}

/* --------------------------------------------------------------- csrf ----- */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(req: Request): string {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

/**
 * Double-submit check on every state-changing admin request.
 *
 * The session cookie is SameSite=Lax, which already blocks the cross-site form
 * post. This is the second lock: a token the browser will only send if the
 * request came from our own JavaScript.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const sent = req.get('x-csrf-token') ?? (req.body as { _csrf?: string } | undefined)?._csrf;
  const expected = req.session?.csrfToken;

  if (!expected || !sent) return next(new ApiError(403, 'CSRF_FAILED', 'Your session expired. Please reload and try again.'));

  const a = Buffer.from(String(sent));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new ApiError(403, 'CSRF_FAILED', 'Your session expired. Please reload and try again.'));
  }
  next();
}
