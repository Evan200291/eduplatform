import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load `.env` before reading any env var. Prisma's `defineConfig` runs before
// the CLI's own env loading, so without this the schema's `env("DATABASE_URL")`
// call sees `undefined` even though `.env` is present.
dotenv.config();

/**
 * Prisma configuration for Midas Learning Cloud.
 *
 * The schema is split across several files in `prisma/schema/` — one file per
 * bounded context — so that a ~70-entity model stays readable and reviewable.
 * Prisma concatenates them, so relations may cross files freely.
 *
 * See prisma/schema/README.md for the file-by-file map.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  // Prisma 6's `defineConfig` does its own env loading and warns when no
  // `datasource.url` is declared. Re-export DATABASE_URL here so the CLI
  // (`prisma migrate`, `prisma generate`, `prisma db push`) and the generated
  // client both see the same connection string loaded from `.env`.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
