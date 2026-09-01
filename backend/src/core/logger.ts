// ─────────────────────────────────────────────────────────────────────────────
// Structured logging
// Blueprint 13: operations must be observable. Logs are JSON in production so a
// VPS log shipper can parse them; `pretty` is available for local development.
//
// Never log a password, hash, token, PIN or full student record. `redactPaths`
// below is the enforced list, and `sanitize()` is available for ad-hoc objects.
// ─────────────────────────────────────────────────────────────────────────────

import pino, { type Logger, type LoggerOptions } from 'pino';
import { env } from '../config/env';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.pin',
  '*.pinHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.refreshTokenHash',
  '*.tokenHash',
  '*.secret',
];

const options: LoggerOptions = {
  level: env.log.level,
  base: { service: 'midas-api', env: env.nodeEnv },
  redact: { paths: redactPaths, censor: '[redacted]' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// `pino-pretty` is an optional development-only convenience. If it is not
// installed the logger falls back to JSON rather than crashing the process.
function buildLogger(): Logger {
  if (env.log.format === 'pretty') {
    try {
      return pino({
        ...options,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      });
    } catch {
      return pino(options);
    }
  }
  return pino(options);
}

export const logger = buildLogger();

/** A child logger tagged with the module it belongs to. */
export function moduleLogger(moduleName: string): Logger {
  return logger.child({ module: moduleName });
}

const SENSITIVE_KEY = /password|passwordhash|pin|pinhash|token|tokenhash|secret|authorization/i;

/**
 * Recursively replaces sensitive values so an arbitrary object can be attached
 * to a log line or an audit entry. Used by the audit service for before/after
 * snapshots.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(entry, depth + 1);
    }
    return output;
  }
  return value;
}
