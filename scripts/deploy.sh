#!/usr/bin/env bash
#
# Midas Learning Cloud — deploy/update on the VPS.
#
#   cd /var/www/midas && ./scripts/deploy.sh
#
# Pulls, installs, builds both packages, applies migrations, reloads the API.
# Safe to re-run. Does NOT seed and does NOT touch backend/.env — both are
# first-run steps, deliberately manual. See docs/DEPLOYMENT.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BRANCH="${DEPLOY_BRANCH:-main}"
PORT="${DEPLOY_PORT:-4000}"

bold() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m!  %s\033[0m\n' "$1"; }
die()  { printf '\033[31mx  %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- preflight --

[ -f backend/.env ] || die "backend/.env is missing. Create it first — see docs/DEPLOYMENT.md section 4."

command -v node >/dev/null || die "node not found"
command -v pm2  >/dev/null || die "pm2 not found (npm install -g pm2)"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ required, found $(node -v)"

if ! grep -qE '^\s*NODE_ENV\s*=\s*production' backend/.env; then
  warn "backend/.env does not set NODE_ENV=production"
fi
if grep -qE '^\s*SEED_DEMO_DATA\s*=\s*true' backend/.env; then
  warn "SEED_DEMO_DATA=true — demo accounts use passwords published in this repo."
fi

if [ -n "$(git status --porcelain)" ]; then
  warn "Working tree has local changes. They will be kept, but a conflicting pull will abort."
fi

# -------------------------------------------------------------------- pull ---

bold "Pulling $BRANCH"
git fetch origin "$BRANCH"
BEFORE="$(git rev-parse HEAD)"
git merge --ff-only "origin/$BRANCH"
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "Already up to date at ${AFTER:0:8} — rebuilding anyway."
else
  echo "${BEFORE:0:8} -> ${AFTER:0:8}"
  git --no-pager log --oneline "$BEFORE..$AFTER" | head -20
fi

# ------------------------------------------------------------------ backend --

bold "Building API"
cd "$ROOT/backend"
# --include=dev explicitly: tsc, prisma and vite are devDependencies, and npm
# omits those if NODE_ENV=production happens to be exported in the shell.
npm ci --include=dev
npm run build
mkdir -p storage/uploads logs

# 171 unit tests, no database required, ~4s. Cheap gate before touching the
# live database. SKIP_TESTS=1 to bypass in an emergency.
if [ "${SKIP_TESTS:-0}" != "1" ]; then
  bold "Running API tests"
  npm test
fi

bold "Applying migrations"
npm run db:deploy

# ----------------------------------------------------------------- frontend --
# Build to a staging directory and swap, so nginx never serves a half-written
# dist/. The previous build is kept as dist.old for a fast rollback.

bold "Building frontend"
cd "$ROOT/frontend"
npm ci --include=dev
npx tsc -b
npx vite build --outDir dist.new --emptyOutDir

[ -f dist.new/index.html ] || die "frontend build produced no index.html"

rm -rf dist.old
[ -d dist ] && mv dist dist.old
mv dist.new dist
echo "Swapped in new frontend build (previous kept at frontend/dist.old)."

# --------------------------------------------------------------------- pm2 ---

bold "Reloading API"
cd "$ROOT"
if pm2 describe midas-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save

# ------------------------------------------------------------------- verify --

bold "Health check"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null 2>&1; then
    echo "API healthy on :${PORT}"
    pm2 status midas-api
    bold "Deploy complete — ${AFTER:0:8}"
    exit 0
  fi
  sleep 2
done

echo
warn "API did not answer /api/v1/health within 30s."
echo "Recent logs:"
pm2 logs midas-api --lines 40 --nostream || true
echo
echo "To roll back the frontend:  rm -rf frontend/dist && mv frontend/dist.old frontend/dist"
echo "To roll back the API:       git reset --hard $BEFORE && ./scripts/deploy.sh"
exit 1
