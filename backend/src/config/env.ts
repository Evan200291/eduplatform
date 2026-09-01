// ─────────────────────────────────────────────────────────────────────────────
// Environment configuration
// The ONLY place in the backend that reads `process.env`. Everything else
// imports `env` from here, so a missing or malformed variable fails fast at
// boot with a readable message instead of surfacing as a runtime bug.
//
// Keep this file in sync with `.env.example`.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** Accepts `true`/`false`/`1`/`0`/`yes`/`no`, case-insensitive. */
const booleanish = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return defaultValue;
      return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const integerish = (defaultValue: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') return defaultValue;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `must be an integer between ${min} and ${max}`,
        });
        return z.NEVER;
      }
      return parsed;
    });

/** A `jsonwebtoken` expiry string such as `15m`, `12h`, `30d`. */
const durationString = (defaultValue: string) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      const candidate = value === undefined || value.trim() === '' ? defaultValue : value.trim();
      if (!/^\d+(ms|s|m|h|d|w|y)$/.test(candidate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'must look like `15m`, `12h` or `30d`',
        });
        return z.NEVER;
      }
      return candidate;
    });

const csvList = (defaultValue: string[]) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return defaultValue;
      return value
        .split(',')
        .map((entry) => entry.trim().replace(/\/+$/, ''))
        .filter((entry) => entry.length > 0);
    });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: integerish(4000, 1, 65535),
  CORS_ORIGINS: csvList(['http://localhost:5173', 'http://localhost:3000']),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((value) => value.startsWith('mysql://'), {
      message: 'must be a MySQL connection string starting with `mysql://`',
    }),

  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_ACCESS_TTL: durationString('15m'),
  JWT_REFRESH_TTL: durationString('30d'),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanish(false),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  ARGON2_MEMORY_COST: integerish(19456, 8192, 1048576),
  ARGON2_TIME_COST: integerish(2, 1, 10),
  ARGON2_PARALLELISM: integerish(1, 1, 16),

  MAX_FAILED_LOGIN_ATTEMPTS: integerish(8, 1, 100),
  ACCOUNT_LOCK_MINUTES: integerish(15, 1, 1440),

  RATE_LIMIT_WINDOW_MS: integerish(60_000, 1000, 3_600_000),
  RATE_LIMIT_MAX: integerish(300, 10, 100_000),
  AUTH_RATE_LIMIT_MAX: integerish(15, 3, 10_000),

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage/uploads'),
  STORAGE_PUBLIC_PATH: z.string().default('/media'),
  MAX_UPLOAD_BYTES: integerish(10_485_760, 1024, 1_073_741_824),

  BOOTSTRAP_OWNER_EMAIL: z.string().email().default('owner@midasstudio.example'),
  BOOTSTRAP_OWNER_PASSWORD: z.string().min(8).default('ChangeMe!2026'),
  BOOTSTRAP_OWNER_NAME: z.string().min(2).default('Midas Platform Owner'),
  SEED_DEMO_DATA: booleanish(true),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
});

const parsed = schema.safeParse(process.env);

// DEBUG (temporary): see what npm handed us before we re-throw.
if (!parsed.success) {
   
  console.error('[env.ts] DATABASE_URL raw =', JSON.stringify(process.env.DATABASE_URL));
   
  console.error('[env.ts] cwd =', process.cwd());
   
  console.error('[env.ts] has .env =', require('node:fs').existsSync('.env'));
   
  console.error('[env.ts] issues =', JSON.stringify(parsed.error.issues, null, 2));
}

if (!parsed.success) {
  const lines = parsed.error.issues.map(
    (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  // Thrown rather than logged: booting with invalid configuration is never safe.
  throw new Error(
    ['Invalid backend environment configuration:', ...lines, '', 'See backend/.env.example.'].join(
      '\n',
    ),
  );
}

const raw = parsed.data;

const isProduction = raw.NODE_ENV === 'production';

// Production-only guardrails. These are deliberately hard failures: an
// unattended VPS deploy that silently keeps a placeholder secret is worse than
// a deploy that refuses to start.
if (isProduction) {
  const placeholders = ['replace-with', 'change-me', 'changeme', 'secret', 'example'];
  const offending: string[] = [];
  for (const [key, value] of Object.entries({
    JWT_ACCESS_SECRET: raw.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: raw.JWT_REFRESH_SECRET,
  })) {
    const lowered = value.toLowerCase();
    if (placeholders.some((placeholder) => lowered.includes(placeholder))) offending.push(key);
  }
  if (raw.JWT_ACCESS_SECRET === raw.JWT_REFRESH_SECRET) {
    offending.push('JWT_ACCESS_SECRET/JWT_REFRESH_SECRET must differ');
  }
  if (offending.length > 0) {
    throw new Error(
      `Refusing to start in production with placeholder secrets: ${offending.join(', ')}`,
    );
  }
}

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,

  corsOrigins: raw.CORS_ORIGINS,
  apiPublicUrl: raw.API_PUBLIC_URL.replace(/\/+$/, ''),
  webPublicUrl: raw.WEB_PUBLIC_URL.replace(/\/+$/, ''),

  databaseUrl: raw.DATABASE_URL,

  jwt: {
    accessSecret: raw.JWT_ACCESS_SECRET,
    refreshSecret: raw.JWT_REFRESH_SECRET,
    accessTtl: raw.JWT_ACCESS_TTL,
    refreshTtl: raw.JWT_REFRESH_TTL,
    issuer: 'midas-learning-cloud',
    audience: 'midas-clients',
  },

  cookie: {
    /// Name of the httpOnly refresh cookie. The access token is never a cookie.
    refreshName: 'midas_refresh',
    domain: raw.COOKIE_DOMAIN && raw.COOKIE_DOMAIN.trim() !== '' ? raw.COOKIE_DOMAIN : undefined,
    secure: raw.COOKIE_SECURE,
    sameSite: raw.COOKIE_SAME_SITE,
    path: '/api/v1/auth',
  },

  argon2: {
    memoryCost: raw.ARGON2_MEMORY_COST,
    timeCost: raw.ARGON2_TIME_COST,
    parallelism: raw.ARGON2_PARALLELISM,
  },

  security: {
    maxFailedLoginAttempts: raw.MAX_FAILED_LOGIN_ATTEMPTS,
    accountLockMinutes: raw.ACCOUNT_LOCK_MINUTES,
  },

  rateLimit: {
    windowMs: raw.RATE_LIMIT_WINDOW_MS,
    max: raw.RATE_LIMIT_MAX,
    authMax: raw.AUTH_RATE_LIMIT_MAX,
  },

  storage: {
    driver: raw.STORAGE_DRIVER,
    localDir: path.resolve(process.cwd(), raw.STORAGE_LOCAL_DIR),
    publicPath: raw.STORAGE_PUBLIC_PATH.startsWith('/')
      ? raw.STORAGE_PUBLIC_PATH
      : `/${raw.STORAGE_PUBLIC_PATH}`,
    maxUploadBytes: raw.MAX_UPLOAD_BYTES,
  },

  bootstrap: {
    ownerEmail: raw.BOOTSTRAP_OWNER_EMAIL,
    ownerPassword: raw.BOOTSTRAP_OWNER_PASSWORD,
    ownerName: raw.BOOTSTRAP_OWNER_NAME,
    seedDemoData: raw.SEED_DEMO_DATA,
  },

  log: {
    level: raw.LOG_LEVEL,
    format: raw.LOG_FORMAT,
  },
} as const;

export type Env = typeof env;
