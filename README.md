# eduplatform

Midas Learning Cloud — a multi-tenant, white-label education platform for UK
primary and secondary schools.

## What it is

One backend serving three permission-gated surfaces:

| Surface | Path | Audience |
|---|---|---|
| Student | `/learn` | Learners, ~5–16 |
| Teacher | `/teach` | Classroom teachers |
| Admin | `/admin` | School administrators and platform staff |

**Stack:** Express + TypeScript + Prisma + MySQL (backend) · Vite + React +
TypeScript + TanStack Query + Tailwind (frontend).

## Running it

```bash
# backend
cd backend
cp .env.example .env      # then fill in DATABASE_URL and the secrets
npm install
npx prisma migrate deploy
npm run seed              # demo school, staff, learners and content
npm run dev               # :4000

# frontend
cd frontend
npm install
npm run dev               # :5173, proxies /api to :4000
```

## Layout

```
backend/
  prisma/schema/     schema, split by domain
  prisma/seed/       demo data
  src/core/          auth, RBAC, HTTP, middleware — shared by every module
  src/modules/       27 feature modules (routes / service / validation)
frontend/
  src/components/    UI kit and layout shells
  src/surfaces/      admin | teacher | student | auth | account | system
  src/<domain>/      api client + types per domain
```

## Two things worth knowing

**Theming is server-driven.** Colours and fonts come from a per-school theme
record, compiled to CSS custom properties. Editing a theme's colours does nothing
until it is **published** — the resolver serves a stored compiled snapshot, not
the raw columns.

**RBAC is code-defined, not database-editable.** Permissions live in
`backend/src/core/rbac/permissions.ts` so an access decision is reviewable in
version control and a deploy cannot silently widen access.

## Security notes

- `.env` is gitignored. Never commit real credentials.
- `backend/prisma/seed/people.seed.ts` contains **demo passwords in plain text**,
  which is normal for a seed script but means anyone with repo access knows them.
  Change them, or make them environment-driven, before running the seed anywhere
  reachable from the internet.
- The bootstrap owner password defaults to a placeholder that the seed itself
  rejects. Set `BOOTSTRAP_OWNER_PASSWORD` to a real value.
