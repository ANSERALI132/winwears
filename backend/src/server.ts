import { createApp } from './app';
import { env } from './env';
import { prisma } from './db';

async function main(): Promise<void> {
  /* Fail loudly at boot rather than on the first request. */
  await prisma.$connect();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`WIN WEARS API listening on http://localhost:${env.PORT}`);
    console.log(`  admin dashboard  http://localhost:${env.PORT}/admin`);
    if (env.SERVE_FRONTEND) console.log(`  public site      http://localhost:${env.PORT}/`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    /* Do not let an open keep-alive connection hold the process forever. */
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
