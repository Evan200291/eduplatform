#!/usr/bin/env bash
#
# Midas Learning Cloud — add the site to a SHARED VPS that already runs other
# apps under PM2 and nginx.
#
#   sudo ./scripts/vps-add-site.sh <domain> <email>
#   sudo BRANCH=feat/content-authoring-and-moderation ./scripts/vps-add-site.sh edu.example.com you@example.com
#
# Unlike vps-bootstrap.sh (which assumes it owns a fresh machine), this script
# never touches anything it does not own:
#   - does not enable/reset the firewall
#   - does not remove nginx's default site
#   - does not install or upgrade Node (other apps depend on it) — it aborts
#   - picks a free localhost port instead of assuming 4000
#   - validates nginx config before reloading, and removes its own site file
#     again if validation fails, so other sites keep serving
#
# Safe to re-run. An existing backend/.env is kept (secrets survive).

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="${APP_DIR:-/var/www/midas}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/Evan200291/eduplatform.git}"
DB_NAME="${DB_NAME:-midas_learning_cloud}"
DB_USER="${DB_USER:-midas}"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-true}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: sudo $0 <domain> <email>" >&2
  exit 1
fi

STEP=0
TOTAL=12
CURRENT="starting up"
NGINX_LINKED=0

step() { STEP=$((STEP + 1)); CURRENT="$1"; printf '\n\033[1;36m[%d/%d] %s\033[0m\n' "$STEP" "$TOTAL" "$1"; }
ok()   { printf '\033[32m    ok - %s\033[0m\n' "$1"; }
note() { printf '\033[33m    !  %s\033[0m\n' "$1"; }
die()  { printf '\033[31m    x  %s\033[0m\n' "$1" >&2; exit 1; }

on_error() {
  printf '\n\033[1;31mFAILED at step %d/%d: %s\033[0m\n' "$STEP" "$TOTAL" "$CURRENT"
  printf 'Other sites on this server were not modified by the failing step.\n'
  printf 'Fix the error above and re-run — the script resumes safely.\n\n'
}
trap on_error ERR

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo)."

# Builds are CPU-heavy; run at low priority so the other apps here keep their share.
renice -n 15 -p $$ >/dev/null 2>&1 || true
ionice -c3 -p $$ >/dev/null 2>&1 || true

printf '\n\033[1mMidas Learning Cloud - add site to shared VPS\033[0m\n'
printf 'Domain: %s\nDir:    %s\nBranch: %s\n' "$DOMAIN" "$APP_DIR" "$BRANCH"

# ---------------------------------------------------------------------------
step "Prerequisites (read-only checks)"

command -v node  >/dev/null 2>&1 || die "node is not installed."
command -v npm   >/dev/null 2>&1 || die "npm is not installed."
command -v pm2   >/dev/null 2>&1 || die "pm2 is not installed."
command -v nginx >/dev/null 2>&1 || die "nginx is not installed."
command -v git   >/dev/null 2>&1 || die "git is not installed."
command -v mysql >/dev/null 2>&1 || die "mysql client is not installed."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ required but this server has $(node -v). Upgrading Node could break the other apps here — do that deliberately, not from this script."
ok "node $(node -v), npm $(npm -v), pm2 $(pm2 -v)"

mysql -e "SELECT 1;" >/dev/null 2>&1 || die "Cannot open a MySQL admin shell as root (mysql -e 'SELECT 1' failed). Create the database by hand or fix root access."
ok "MySQL admin access works"

# The TypeScript build needs ~2-3GB. On a shared box the kernel's OOM killer
# picks the biggest process, which is probably somebody else's app, not ours.
# So refuse to build unless memory (free + swap) is clearly enough.
AVAIL_MB="$(free -m | awk '/^Mem:/{print $7}')"
SWAP_FREE_MB="$(free -m | awk '/^Swap:/{print $4}')"
HEADROOM_MB=$(( ${AVAIL_MB:-0} + ${SWAP_FREE_MB:-0} ))
if [ "$HEADROOM_MB" -lt 3000 ] && [ "${FORCE_LOW_MEMORY:-0}" != "1" ]; then
  die "Only ${HEADROOM_MB}MB of memory+swap headroom; the build needs ~3GB and running out would let the kernel kill OTHER apps on this server. Add swap first (fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile) or build elsewhere. Override with FORCE_LOW_MEMORY=1 at your own risk."
fi
ok "memory headroom ${HEADROOM_MB}MB"

DISK_FREE_MB="$(df -Pm "$(dirname "$APP_DIR")" | awk 'NR==2{print $4}')"
[ "${DISK_FREE_MB:-0}" -ge 3000 ] || die "Only ${DISK_FREE_MB}MB disk free where ${APP_DIR} will live; need ~3GB for install + build."

# Never adopt or modify a database/user this script did not create. Ownership
# is proven by the password file only this script writes.
DB_PW_FILE="/root/.midas-db-pw"
DB_EXISTS="$(mysql -N -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${DB_NAME}';")"
USER_EXISTS="$(mysql -N -e "SELECT COUNT(*) FROM mysql.user WHERE user='${DB_USER}';")"
if [ ! -f "$DB_PW_FILE" ] && { [ "$DB_EXISTS" -gt 0 ] || [ "$USER_EXISTS" -gt 0 ]; }; then
  die "MySQL already has a database named '${DB_NAME}' (count=${DB_EXISTS}) or a user named '${DB_USER}' (count=${USER_EXISTS}) that this script did not create. Altering it could break another app. Re-run with different names, e.g. DB_NAME=midas_edu DB_USER=midas_edu."
fi
ok "database/user names are unclaimed (or already ours)"

if pm2 describe midas-api >/dev/null 2>&1; then
  note "A PM2 process named midas-api already exists — it will be reloaded, not duplicated."
fi

# ---------------------------------------------------------------------------
step "Pick a free localhost port"

if [ -f "$APP_DIR/backend/.env" ] && grep -qE '^PORT=[0-9]+' "$APP_DIR/backend/.env"; then
  PORT="$(grep -E '^PORT=' "$APP_DIR/backend/.env" | head -1 | tr -dc '0-9')"
  ok "reusing PORT=$PORT from existing .env"
else
  PORT=4000
  while ss -tln | awk '{print $4}' | grep -qE "[:.]${PORT}\$"; do PORT=$((PORT + 1)); done
  ok "port $PORT is free"
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  printf '\n\033[1;32mDRY RUN - every check above passed and NOTHING was changed.\033[0m\n'
  printf 'A real run would:\n'
  printf '  clone/update  %s (branch %s)\n' "$APP_DIR" "$BRANCH"
  printf '  create MySQL  database %s + user %s (granted on that database only)\n' "$DB_NAME" "$DB_USER"
  printf '  start PM2     one new process, midas-api, on 127.0.0.1:%s\n' "$PORT"
  printf '  add nginx     /etc/nginx/sites-available/%s (validated, rolled back on failure)\n' "$DOMAIN"
  printf '  not touch     other PM2 apps, other databases, firewall, default nginx site, Node\n\n'
  trap - ERR
  exit 0
fi

# ---------------------------------------------------------------------------
step "Get the code"

mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"
ok "at $(git rev-parse --short HEAD) on $BRANCH"

# ---------------------------------------------------------------------------
step "Database"

if [ ! -f "$DB_PW_FILE" ]; then
  openssl rand -hex 24 >"$DB_PW_FILE"
  chmod 600 "$DB_PW_FILE"
fi
DB_PW="$(cat "$DB_PW_FILE")"

mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PW}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PW}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
mysql -u "$DB_USER" -p"$DB_PW" -e "SELECT 1;" "$DB_NAME" >/dev/null
ok "${DB_NAME} reachable as '${DB_USER}' (only this database is granted)"

# ---------------------------------------------------------------------------
step "Configuration (backend/.env)"

cd "$APP_DIR/backend"
if [ -f .env ]; then
  note "existing .env kept — secrets preserved; only the domain/port lines are refreshed"
  sed -i \
    -e "s|^PORT=.*|PORT=${PORT}|" \
    -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|" \
    -e "s|^API_PUBLIC_URL=.*|API_PUBLIC_URL=https://${DOMAIN}/api/v1|" \
    -e "s|^WEB_PUBLIC_URL=.*|WEB_PUBLIC_URL=https://${DOMAIN}|" \
    -e "s|^COOKIE_DOMAIN=.*|COOKIE_DOMAIN=${DOMAIN}|" \
    .env
else
  OWNER_PW_FILE="/root/.midas-owner-pw"
  if [ ! -f "$OWNER_PW_FILE" ]; then
    openssl rand -base64 18 | tr -d '/+=' | cut -c1-16 >"$OWNER_PW_FILE"
    chmod 600 "$OWNER_PW_FILE"
  fi
  cat >.env <<ENVEOF
NODE_ENV=production
PORT=${PORT}

CORS_ORIGINS=https://${DOMAIN}
API_PUBLIC_URL=https://${DOMAIN}/api/v1
WEB_PUBLIC_URL=https://${DOMAIN}

DATABASE_URL="mysql://${DB_USER}:${DB_PW}@localhost:3306/${DB_NAME}?connection_limit=10&pool_timeout=20"

JWT_ACCESS_SECRET=$(openssl rand -hex 48)
JWT_REFRESH_SECRET=$(openssl rand -hex 48)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

COOKIE_DOMAIN=${DOMAIN}
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax

STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage/uploads
STORAGE_PUBLIC_PATH=/media
MAX_UPLOAD_BYTES=20971520

BOOTSTRAP_OWNER_EMAIL=owner@midas.local
BOOTSTRAP_OWNER_PASSWORD=$(cat "$OWNER_PW_FILE")
BOOTSTRAP_OWNER_NAME=Platform Owner

SEED_DEMO_DATA=${SEED_DEMO_DATA}

LOG_LEVEL=info
LOG_FORMAT=json
ENVEOF
  ok "generated with fresh secrets"
fi
chmod 600 .env
mkdir -p storage/uploads logs

# ---------------------------------------------------------------------------
step "Backend dependencies"
export NODE_OPTIONS="--max-old-space-size=3072"
npm ci --include=dev --no-audit --no-fund
ok "installed"

# ---------------------------------------------------------------------------
step "Backend build and tests"
npm run build
[ -f dist/server.js ] || die "Build finished but dist/server.js is missing (if it said 'Killed', it ran out of memory)."
npm test
ok "dist/server.js built, tests passed"

# ---------------------------------------------------------------------------
step "Migrations and seed"
npm run db:deploy
npm run db:seed
USER_COUNT="$(mysql -u "$DB_USER" -p"$DB_PW" -N -e "SELECT COUNT(*) FROM users;" "$DB_NAME" 2>/dev/null || echo 0)"
[ "$USER_COUNT" -gt 0 ] || die "Seed produced no user accounts."
ok "${USER_COUNT} user accounts"

# ---------------------------------------------------------------------------
step "Frontend build"
cd "$APP_DIR/frontend"
npm ci --include=dev --no-audit --no-fund
npm run build
[ -f dist/index.html ] || die "Frontend build produced no index.html."
ok "dist/index.html built"

# ---------------------------------------------------------------------------
step "Start the API under PM2 (only midas-api is touched)"
cd "$APP_DIR"
if pm2 describe midas-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi
HEALTHY=0
for _ in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 2
done
if [ "$HEALTHY" -ne 1 ]; then
  pm2 logs midas-api --lines 40 --nostream || true
  die "API is not answering on 127.0.0.1:${PORT}."
fi
# `pm2 save` rewrites the list PM2 restores after a reboot with whatever is
# running right now. Keep the previous list so it can be put back.
if [ -f /root/.pm2/dump.pm2 ]; then
  cp -p /root/.pm2/dump.pm2 "/root/.pm2/dump.pm2.before-midas.$(date +%Y%m%d-%H%M%S)"
  note "previous PM2 boot list backed up next to dump.pm2 (dump.pm2.before-midas.*)"
fi
pm2 save >/dev/null
ok "midas-api online on 127.0.0.1:${PORT}"

# ---------------------------------------------------------------------------
step "nginx (validated before reload; rolled back on failure)"

SITE="/etc/nginx/sites-available/${DOMAIN}"
cat >"$SITE" <<NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${APP_DIR}/frontend/dist;
    index index.html;
    client_max_body_size 25M;

    location / { try_files \$uri \$uri/ /index.html; }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
    }
}
NGINXEOF

ln -sf "$SITE" "/etc/nginx/sites-enabled/${DOMAIN}"
if nginx -t 2>/dev/null; then
  systemctl reload nginx
  ok "serving ${DOMAIN}"
else
  rm -f "/etc/nginx/sites-enabled/${DOMAIN}"
  nginx -t || true
  die "nginx config failed validation — our site was removed again; nothing was reloaded."
fi

# ---------------------------------------------------------------------------
step "TLS certificate"

SERVER_IP="$(curl -fsS https://ifconfig.me 2>/dev/null || true)"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$RESOLVED" ]; then
  note "$DOMAIN does not resolve yet — TLS skipped."
  note "Add a DNS A record: $DOMAIN -> ${SERVER_IP:-the server IP}, wait a few minutes, then run:"
  note "  certbot --nginx -d $DOMAIN --redirect -m $EMAIL --agree-tos"
  note "Login will not work until HTTPS is live (COOKIE_SECURE=true)."
elif [ -n "$SERVER_IP" ] && [ "$RESOLVED" != "$SERVER_IP" ]; then
  note "$DOMAIN resolves to $RESOLVED but this server is $SERVER_IP — TLS skipped."
  note "Fix the A record, then run: certbot --nginx -d $DOMAIN --redirect -m $EMAIL --agree-tos"
else
  command -v certbot >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx >/dev/null; }
  certbot --nginx -d "$DOMAIN" --redirect --agree-tos -m "$EMAIL" --no-eff-email --non-interactive
  pm2 restart midas-api --update-env >/dev/null
  ok "HTTPS live"
fi

trap - ERR
printf '\n\033[1;32m  Done - https://%s\033[0m\n\n' "$DOMAIN"
printf 'Owner     owner@midas.local\n            password: %s\n\n' "$(cat /root/.midas-owner-pw 2>/dev/null || echo '(existing .env kept)')"
if [ "$SEED_DEMO_DATA" = "true" ]; then
  printf 'Demo staff password (public in the repo): Riverbank!2026   e.g. nadia.okafor@riverbank.example\n'
  printf 'Demo pupils: code RVB-0001 upward, PIN 2468\n\n'
fi
printf 'Prototype https://%s/prototype/   (clickable design for every page; no login)
' "$DOMAIN"
printf 'Update    cd %s && ./scripts/deploy.sh   (DEPLOY_BRANCH=%s if not main)\n' "$APP_DIR" "$BRANCH"
printf 'Logs      pm2 logs midas-api\n'
printf 'NOT done  firewall / default nginx site / Node — left as they were.\n\n'
