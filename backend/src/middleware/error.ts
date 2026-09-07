/**
 * The one place an error becomes a response.
 *
 * Rule: the client is told only what an ApiError or a Zod failure says. Every
 * other throw is logged in full on the server and answered with a single
 * generic sentence, so a Prisma message, a stack trace or a connection string
 * cannot reach a customer.
 */
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { ApiError, GENERIC_MESSAGE } from '../lib/errors';
import { isProd } from '../env';

/** Wraps an async handler so a rejected promise reaches this middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

interface FieldIssue {
  field: string;
  message: string;
}

function zodIssues(err: ZodError): FieldIssue[] {
  return err.issues.map((i) => ({ field: i.path.join('.') || '_', message: i.message }));
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(err);

  /* --- things we are willing to describe ------------------------------- */

  if (err instanceof ZodError) {
    res.status(422).json({
      error: { code: 'VALIDATION_FAILED', message: 'Please check the highlighted fields.', issues: zodIssues(err) },
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is too large.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Too many files in one upload.'
          : 'That upload could not be accepted.';
    res.status(400).json({ error: { code: err.code, message } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    /* Only the constraint violations an admin can act on are translated. The
       field name is safe to echo; the driver text is not. */
    if (err.code === 'P2002') {
      const fields = (err.meta?.target as string[] | undefined) ?? [];
      const label = fields.includes('sku') ? 'SKU' : fields.includes('slug') ? 'slug' : (fields[0] ?? 'value');
      res.status(409).json({
        error: { code: 'CONFLICT', message: `That ${label} is already used by another record.`, issues: fields.map((f) => ({ field: f, message: 'Already in use.' })) },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That record no longer exists.' } });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({
        error: { code: 'IN_USE', message: 'That record is still referenced by something else and cannot be removed.' },
      });
      return;
    }
  }

  /* --- everything else -------------------------------------------------- */

  const ref = Math.random().toString(36).slice(2, 10);
  console.error(`[error ${ref}] ${req.method} ${req.originalUrl}`, err);

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: GENERIC_MESSAGE,
      /* A short reference so a report can be matched to the server log
         without putting any detail of the failure in the response. */
      ref,
      ...(isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}
