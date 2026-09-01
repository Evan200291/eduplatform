// ─────────────────────────────────────────────────────────────────────────────
// Prisma client singleton
// One connection pool per process. `tsx watch` reloads the module graph on every
// save, so in development the instance is cached on `globalThis` to avoid
// exhausting MySQL's connection limit with orphaned pools.
//
// Blueprint 11: the data layer is reached only through this client. Modules
// import `prisma` from here rather than constructing their own.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from './logger';

const log = logger.child({ module: 'prisma' });

function createClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
    log: env.isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
  });

  client.$on('warn' as never, (event: Prisma.LogEvent) => {
    log.warn({ target: event.target }, event.message);
  });

  client.$on('error' as never, (event: Prisma.LogEvent) => {
    log.error({ target: event.target }, event.message);
  });

  if (env.isDevelopment) {
    client.$on('query' as never, (event: Prisma.QueryEvent) => {
      // Params are omitted deliberately: they routinely contain password hashes
      // and learner data.
      log.debug({ durationMs: event.duration, query: event.query }, 'query');
    });
  }

  return client;
}

type PrismaGlobal = typeof globalThis & { __midasPrisma?: PrismaClient };

const globalRef = globalThis as PrismaGlobal;

export const prisma: PrismaClient = globalRef.__midasPrisma ?? createClient();

if (!env.isProduction) {
  globalRef.__midasPrisma = prisma;
}

/** Verifies the database is reachable. Called once during server startup. */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  log.info('database connection established');
}

/** Closes the pool during graceful shutdown. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  log.info('database connection closed');
}

/**
 * Runs `fn` inside a transaction. Every write that spans more than one table
 * (awarding points and writing the ledger entry, approving a recommendation and
 * mutating the path) must go through this so a partial write is impossible.
 */
export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 5_000, timeout: 20_000 });
}

export type TransactionClient = Prisma.TransactionClient;
export { Prisma };
