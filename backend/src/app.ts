/**
 * Express application wiring.
 *
 * Kept separate from server.ts so the app can be imported by a test or a
 * serverless adapter without a port being opened.
 */
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env, isProd } from './env';
import { PrismaSessionStore } from './lib/sessionStore';
import { livenessCheck } from './lib/health';
import { loadUser } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { publicRouter } from './api/public';
import { authRouter } from './api/auth';
import { adminRouter } from './api/admin';
import { aiRouter } from './api/ai';

export function createApp(): express.Express {
  const app = express();

  /* Behind a reverse proxy the client IP and the https flag arrive in headers.
     Only trust them when we know a proxy is really in front, or rate limiting
     can be defeated by a spoofed X-Forwarded-For. */
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      /* The public site loads three.js from cdnjs and Google Fonts CSS, so the
         policy names those hosts explicitly instead of allowing everything. */
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          /* blob: is how GLTFLoader reads the textures packed inside the match ball
             model: it unpacks them to blob URLs and fetches them back. A blob URL
             is data this page already holds, so this opens no other host. */
          connectSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          ...(isProd ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      /* Product photos are served to the site itself; the default same-origin
         policy is what we want, spelled out so it is not accidentally relaxed. */
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use(compression());
  app.use(morgan(isProd ? 'combined' : 'dev'));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(
    session({
      name: 'ww.sid',
      secret: env.AUTH_SECRET,
      store: new PrismaSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        /* Secure cookies require https; in local development there is none,
           and an unsettable cookie would make sign-in silently fail. */
        secure: isProd,
        sameSite: 'lax',
        maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
        path: '/',
      },
    }),
  );

  app.use(loadUser);

  /**
   * Liveness, for an uptime monitor.
   *
   * This used to answer `ok: true` unconditionally, which meant it reported a
   * healthy site while the database was refusing connections — the one
   * failure a monitor exists to catch. It now asks the database whether it is
   * there, and answers 503 when it is not, because a monitor reads the status
   * code rather than the body.
   *
   * Deliberately says nothing else. It is unauthenticated, so everything here
   * is public; the detailed report lives behind the admin guard.
   */
  app.get('/api/health', (_req, res) => {
    void livenessCheck().then(({ ok }) => {
      res
        .status(ok ? 200 : 503)
        .set('Cache-Control', 'no-store')
        .json({ data: { ok, uptime: Math.round(process.uptime()) } });
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  /* Ahead of the catch-all public router: /api/ai carries its own rate limit,
     priced for paid API calls rather than database reads. */
  app.use('/api/ai', aiRouter);
  app.use('/api', publicRouter);

  /* Uploaded files, when the local storage driver is in use. */
  if (env.STORAGE_PROVIDER === 'local') {
    const dir = path.isAbsolute(env.STORAGE_LOCAL_DIR)
      ? env.STORAGE_LOCAL_DIR
      : path.resolve(__dirname, '..', env.STORAGE_LOCAL_DIR);
    app.use(
      env.STORAGE_PUBLIC_PATH,
      express.static(dir, {
        maxAge: '30d',
        index: false,
        /* Nothing in here is ever meant to run: tell the browser to take the
           declared type literally and never sniff its way to a script. */
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
      }),
    );
  }

  /* The admin dashboard: static files, with the API doing the real gating. */
  app.use('/admin', express.static(path.resolve(__dirname, 'admin', 'public'), { index: 'index.html' }));
  app.get('/admin/*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'admin', 'public', 'index.html'));
  });

  /* The public website. Optional — a CDN usually serves it in production. */
  if (env.SERVE_FRONTEND) {
    const frontend = path.isAbsolute(env.FRONTEND_DIR)
      ? env.FRONTEND_DIR
      : path.resolve(__dirname, '..', env.FRONTEND_DIR);
    app.use(express.static(frontend, { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.status(404).sendFile(path.join(frontend, '404.html'), (err) => (err ? next() : undefined));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
