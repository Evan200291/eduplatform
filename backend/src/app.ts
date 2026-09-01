// ─────────────────────────────────────────────────────────────────────────────
// Express application
// Assembled here and exported without listening, so tests can drive it directly
// and `server.ts` owns the process lifecycle.
//
// Middleware order is load-bearing: security headers → parsers → request id →
// rate limit → routes → 404 → error handler. Anything that throws after the
// router is mounted still lands in the single error handler.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './core/http/error-handler';
import { logger } from './core/logger';
import { requestContext } from './core/middleware/request-context';
import { globalRateLimit } from './core/middleware/rate-limit';
import { apiRouter } from './routes';

export function createApp(): Express {
  const app = express();

  // Behind nginx on the VPS. Trusting exactly one proxy hop keeps `req.ip`
  // accurate for rate limiting without letting a client forge the header.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The SPA is served separately (nginx or the `midas-web` PM2 process), so
      // the API only ever returns JSON and files it owns.
      contentSecurityPolicy: env.isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin.replace(/\/+$/, ''))) return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).context?.requestId ?? 'unknown',
      autoLogging: {
        // Health checks would otherwise dominate the log volume on a VPS.
        ignore: (req) => req.url === '/api/v1/health' || req.url === '/health',
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(globalRateLimit);

  // Uploaded media. Public assets (logos, favicons) are served directly for
  // speed; everything else is fetched through the authorized media endpoint.
  app.use(
    `${env.storage.publicPath}`,
    express.static(path.join(env.storage.localDir, 'public'), {
      maxAge: env.isProduction ? '7d' : 0,
      fallthrough: true,
      index: false,
      dotfiles: 'deny',
    }),
  );

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
