/**
 * express-session store backed by the Session table.
 *
 * Sessions live in Postgres rather than in memory so that they survive a
 * restart, work behind more than one process, and — the reason that matters
 * for an admin panel — can be revoked centrally the moment an account is
 * disabled. A stateless JWT could not be taken back.
 */
import { Store, type SessionData } from 'express-session';
import { prisma } from '../db';

type Cb = (err?: unknown, session?: SessionData | null) => void;

export class PrismaSessionStore extends Store {
  /** Sweep expired rows periodically; Postgres will not do it for us. */
  private timer: NodeJS.Timeout;

  constructor(pruneIntervalMs = 15 * 60 * 1000) {
    super();
    this.timer = setInterval(() => {
      void prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {
        /* A failed sweep is not worth crashing the process over. */
      });
    }, pruneIntervalMs);
    this.timer.unref();
  }

  override get(sid: string, cb: Cb): void {
    prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row) return cb(null, null);
        if (row.expiresAt.getTime() < Date.now()) {
          return prisma.session.delete({ where: { sid } }).then(
            () => cb(null, null),
            () => cb(null, null),
          );
        }
        cb(null, JSON.parse(row.data) as SessionData);
      })
      .catch((err) => cb(err));
  }

  override set(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    const expiresAt = session.cookie?.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + (session.cookie?.maxAge ?? 12 * 60 * 60 * 1000));
    const data = JSON.stringify(session);
    /* Denormalised so an admin can be signed out everywhere by userId. */
    const userId = (session as { userId?: string }).userId ?? null;

    prisma.session
      .upsert({
        where: { sid },
        create: { sid, data, expiresAt, userId },
        update: { data, expiresAt, userId },
      })
      .then(
        () => cb?.(),
        (err) => cb?.(err),
      );
  }

  override destroy(sid: string, cb?: (err?: unknown) => void): void {
    prisma.session.deleteMany({ where: { sid } }).then(
      () => cb?.(),
      (err) => cb?.(err),
    );
  }

  override touch(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    const expiresAt = session.cookie?.expires
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + (session.cookie?.maxAge ?? 12 * 60 * 60 * 1000));
    prisma.session.updateMany({ where: { sid }, data: { expiresAt } }).then(
      () => cb?.(),
      (err) => cb?.(err),
    );
  }

  /** Used when an account is disabled or its password changes. */
  async destroyAllForUser(userId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { userId } });
  }
}
