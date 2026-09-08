/**
 * Rate limits for anything a stranger can reach.
 *
 * Four tiers: generous for reads, tight for the public forms, tighter still
 * for the login endpoint, where the cost of an unthrottled attempt is a
 * guessed password — and a separate one for the AI assistant, where the cost
 * of an unthrottled request is measured in money.
 */
import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../env';

const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;

const base: Partial<Options> = {
  windowMs,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } },
};

/** Public catalogue reads. */
export const readLimiter = rateLimit({ ...base, limit: env.RATE_LIMIT_PUBLIC_MAX });

/** Quote and contact submissions. */
export const formLimiter = rateLimit({
  ...base,
  limit: env.RATE_LIMIT_FORM_MAX,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'You have sent several enquiries already. Please wait a few minutes, or message us on WhatsApp.',
    },
  },
});

/** Sign-in attempts. Successful logins are skipped so a working password is
 *  never what locks somebody out. */
export const loginLimiter = rateLimit({
  ...base,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  skipSuccessfulRequests: true,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please try again shortly.' } },
});

/** Messages to the AI assistant. Every one is a paid API call, so this is the
 *  tier that protects the bill rather than the database. The reply points at
 *  WhatsApp because a throttled customer still deserves somewhere to go. */
export const aiLimiter = rateLimit({
  ...base,
  limit: env.RATE_LIMIT_AI_MAX,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'You have sent a lot of messages. Please wait a few minutes, or continue on WhatsApp.',
    },
  },
});
