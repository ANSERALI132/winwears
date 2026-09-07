/**
 * Sign in, sign out, and "who am I".
 */
import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/error';
import { loginLimiter } from '../lib/rateLimit';
import { unauthorized } from '../lib/errors';
import { verifyPassword, hashPassword } from '../lib/auth';
import { loginSchema, changePasswordSchema } from '../validation/admin';
import { issueCsrfToken, requireAuth, csrfProtection } from '../middleware/auth';
import { log } from '../lib/audit';

export const authRouter = Router();

/** One message for both "no such account" and "wrong password", so the
 *  endpoint cannot be used to discover which emails exist. */
const BAD_CREDENTIALS = 'Email or password is incorrect.';

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    /* Hash a throwaway value when the account is missing so that the reply
       takes about the same time either way — a fast "no" is itself an answer. */
    const hash = user?.passwordHash ?? '$2a$12$0000000000000000000000000000000000000000000000000000';
    const ok = await verifyPassword(password, hash);

    if (!user || !ok || !user.active) throw unauthorized(BAD_CREDENTIALS);

    /* New session id on privilege change: this is what stops a fixed
       pre-login cookie from being upgraded into an admin session. */
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );

    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    const csrfToken = issueCsrfToken(req);

    await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await log({ adminId: user.id, action: 'signed_in', entity: 'user', entityId: user.id, summary: user.email });

    res.json({
      data: { user: { id: user.id, name: user.name, email: user.email, role: user.role }, csrfToken },
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const id = req.session?.userId;
    if (id) await log({ adminId: id, action: 'signed_out', entity: 'user', entityId: id });
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    res.clearCookie('ww.sid');
    res.json({ data: { ok: true } });
  }),
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.admin) throw unauthorized();
    res.json({ data: { user: req.admin, csrfToken: issueCsrfToken(req) } });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  csrfProtection,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const me = req.admin!;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw unauthorized('Your current password is not correct.');
    }

    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(newPassword) } });

    /* Every other session for this account is now stale. */
    await prisma.session.deleteMany({ where: { userId: me.id, NOT: { sid: req.sessionID } } });
    await log({ adminId: me.id, action: 'updated', entity: 'user', entityId: me.id, summary: 'Changed own password' });

    res.json({ data: { ok: true } });
  }),
);
