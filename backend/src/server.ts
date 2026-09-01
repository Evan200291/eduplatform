// ─────────────────────────────────────────────────────────────────────────────
// Process entry point
// Started by PM2 as `node dist/server.js` (see ecosystem.config.cjs).
//
// Graceful shutdown matters here: PM2 sends SIGINT on reload, and a hard exit
// mid-request would drop a learner's submitted answers. In-flight requests are
// allowed to finish, then the database pool closes.
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './core/logger';
import { connectDatabase, disconnectDatabase } from './core/prisma';
import { initStorage } from './core/storage';
import { startScheduledJobs, stopScheduledJobs } from './jobs';

const log = logger.child({ module: 'server' });

async function main(): Promise<void> {
  await connectDatabase();
  await initStorage();

  const app = createApp();
  const server = http.createServer(app);

  // Slightly above a typical 60s proxy timeout so nginx closes first and the
  // client sees a clean gateway error rather than a socket reset.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  await new Promise<void>((resolve) => server.listen(env.port, resolve));
  log.info({ port: env.port, env: env.nodeEnv }, 'Midas Learning Cloud API listening');

  startScheduledJobs();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'shutting down');

    stopScheduledJobs();

    const forceExit = setTimeout(() => {
      log.error('shutdown timed out; exiting');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    server.close((error) => {
      if (error) log.error({ err: error }, 'error while closing the HTTP server');
      void disconnectDatabase()
        .catch((disconnectError: unknown) =>
          log.error({ err: disconnectError }, 'error while closing the database pool'),
        )
        .finally(() => {
          clearTimeout(forceExit);
          process.exit(error ? 1 : 0);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    log.error({ err: reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    // The process state is no longer trustworthy; let PM2 restart it.
    log.fatal({ err: error }, 'uncaught exception');
    shutdown('uncaughtException');
  });
}

void main().catch((error: unknown) => {
  log.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
