import { PrismaClient } from '@prisma/client';
import { env, isProd } from './env';

/* tsx --watch reloads this module on every save; without the global handle we
   would leak a connection pool per reload until Postgres refuses new clients. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['warn', 'error'] : ['warn', 'error'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

if (!isProd) globalForPrisma.prisma = prisma;
