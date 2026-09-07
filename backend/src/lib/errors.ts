/**
 * Error types the API is allowed to describe to a caller.
 *
 * Anything not thrown as an ApiError is treated as a bug: it is logged in full
 * on the server and reduced to a generic message on the wire, so a Prisma or
 * driver error can never leak schema or connection details to a customer.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'Invalid request.', details?: unknown) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'You need to sign in.') =>
  new ApiError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to that.') =>
  new ApiError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message);

export const conflict = (message = 'That already exists.', details?: unknown) =>
  new ApiError(409, 'CONFLICT', message, details);

export const tooLarge = (message = 'That file is too large.') =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', message);

export const unsupportedMedia = (message = 'That file type is not allowed.') =>
  new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message);

/** The single sentence a customer is ever shown for an unexpected failure. */
export const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
