#!/usr/bin/env bash
#
# Midas Learning Cloud — one-shot first install on a fresh Ubuntu VPS.
#
#   ./scripts/vps-bootstrap.sh <domain> <email>
#
# e.g.
#   ./scripts/vps-bootstrap.sh japan.exabytetier.online you@example.com
#
# Safe to re-run: an existing .env is kept (so generated secrets survive), the
# database user is upserted, and nginx/pm2 config is replaced, not duplicated.
#
# Point the domain's DNS A record at this server BEFORE running — the TLS step
# needs it, and is skipped with instructions if the name does not resolve.

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="${APP_DIR:-/var/www/midas}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: $0 <domain> <email>" >&2
  echo "   e.g. $0 japan.exabytetier.online you@example.com" >&2
  exit 1
fi

STEP=0
TOTAL=13
CURRENT="starting up"

step() {
  STEP=$((STEP + 1))
  CURRENT="$1"
  printf '\n\033[1;36m[%d/%d] %s\033[0m\n' "$STEP" "$TOTAL" "$1"
}
ok()   { printf '\033[32m    ok - %s\033[0m\n' "$1"; }
note() { printf '\033[33m    !  %s\033[0m\n' "$1"; }

on_error() {
  printf '\n\033[1;31m================================================\033[0m\n'
  printf '\033[1;31mFAILED at step %d/%d: %s\033[0m\n' "$STEP" "$TOTAL" "$CURRENT"
  printf '\033[1;31m================================================\033[0m\n'
  printf 'Nothing after this step ran. Fix the error shown above, then run\n'
  printf 'this script again - it resumes safely from a partial install.\n\n'
}
trap on_error ERR

[ "$(id -u)" -eq 0 ] || { echo "Run as root (or with sudo)." >&2; exit 1; }
[ -f "$APP_DIR/ecosystem.config.cjs" ] || {
  echo "$APP_DIR does not look like the repo (no ecosystem.config.cjs)." >&2
  exit 1
}

printf '\n\033[1mMidas Learning Cloud - VPS bootstrap\033[0m\n'
printf 'Domain: %s\nDir:    %s\n' "$DOMAIN" "$APP_DIR"

# ---------------------------------------------------------------------------
step "Swap memory (the TypeScript build needs it)"

TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}' || echo 0)
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}' || echo 0)
TOTAL_RAM_MB=${TOTAL_RAM_MB:-0}
SWAP_MB=${SWAP_MB:-0}
if [ "$SWAP_MB" -lt 1024 ] && [ "$TOTAL_RAM_MB" -lt 4096 ]; then
  if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  ok "4G swap active (RAM is ${TOTAL_RAM_MB}MB)"
else
  ok "enough memory (RAM ${TOTAL_RAM_MB}MB, swap ${SWAP_MB}MB)"
fi

# tsc is the memory-hungry step. Capping the heap makes it fail with a real
# error instead of being OOM-killed with no diagnostic at all.
export NODE_OPTIONS="--max-old-space-size=3072"

# ---------------------------------------------------------------------------
step "System packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx mysql-server ufw ca-certificates >/dev/null
ok "curl git nginx mysql ufw"

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  if [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then NEED_NODE=0; fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
ok "node $(node -v)"

command -v pm2 >/dev/null 2>&1 || npm install -g pm2 --silent >/dev/null
ok "pm2 installed"

# ---------------------------------------------------------------------------
step "Database"

systemctl enable --now mysql >/dev/null 2>&1 || true
if [ ! -f /root/.midas-db-pw ]; then
  openssl rand -hex 24 >/root/.midas-db-pw
  chmod 600 /root/.midas-db-pw
fi
DB_PW="$(cat /root/.midas-db-pw)"

mysql <<SQL
CREATE DATABASE IF NOT EXISTS midas_learning_cloud
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'midas'@'localhost' IDENTIFIED BY '${DB_PW}';
ALTER USER 'midas'@'localhost' IDENTIFIED BY '${DB_PW}';
GRANT ALL PRIVILEGES ON midas_learning_cloud.* TO 'midas'@'localhost';
FLUSH PRIVILEGES;
SQL

mysql -u midas -p"$DB_PW" -e "SELECT 1;" midas_learning_cloud >/dev/null
ok "midas_learning_cloud reachable as user 'midas'"

# ---------------------------------------------------------------------------
step "Configuration (backend/.env)"

cd "$APP_DIR/backend"
if [ -f .env ]; then
  note "existing .env kept - its generated secrets are preserved"
  sed -i \
    -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|" \
    -e "s|^API_PUBLIC_URL=.*|API_PUBLIC_URL=https://${DOMAIN}/api/v1|" \
    -e "s|^WEB_PUBLIC_URL=.*|WEB_PUBLIC_URL=https://${DOMAIN}|" \
    -e "s|^COOKIE_DOMAIN=.*|COOKIE_DOMAIN=${DOMAIN}|" \
    .env
else
  if [ ! -f /root/.midas-owner-pw ]; then
    openssl rand -base64 18 | tr -d '/+=' | cut -c1-16 >/root/.midas-owner-pw
    chmod 600 /root/.midas-owner-pw
  fi
  OWNER_PW="$(cat /root/.midas-owner-pw)"
  ACCESS_SECRET="$(openssl rand -hex 48)"
  REFRESH_SECRET="$(openssl rand -hex 48)"

  cat >.env <<ENVEOF
NODE_ENV=production
PORT=4000

CORS_ORIGINS=https://${DOMAIN}
API_PUBLIC_URL=https://${DOMAIN}/api/v1
WEB_PUBLIC_URL=https://${DOMAIN}

DATABASE_URL="mysql://midas:${DB_PW}@localhost:3306/midas_learning_cloud?connection_limit=10&pool_timeout=20"

JWT_ACCESS_SECRET=${ACCESS_SECRET}
JWT_REFRESH_SECRET=${REFRESH_SECRET}
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
BOOTSTRAP_OWNER_PASSWORD=${OWNER_PW}
BOOTSTRAP_OWNER_NAME=Platform Owner

SEED_DEMO_DATA=true

LOG_LEVEL=info
LOG_FORMAT=json
ENVEOF
  ok "generated with fresh secrets"
fi
chmod 600 .env
mkdir -p storage/uploads logs

# ---------------------------------------------------------------------------
step "Backend dependencies"
# --include=dev is required: tsc, prisma and vite are all devDependencies, and
# npm omits those when NODE_ENV=production is set in the environment.
npm ci --include=dev --no-audit --no-fund
ok "installed"

# ---------------------------------------------------------------------------
step "Backend build"
npm run build
[ -f dist/server.js ] || {
  echo "Build finished but dist/server.js is missing." >&2
  echo "If the output above says 'Killed', it ran out of memory." >&2
  exit 1
}
ok "dist/server.js built"

# ---------------------------------------------------------------------------
step "Backend tests"
npm test
ok "tests passed"

# ---------------------------------------------------------------------------
step "Migrations and demo data"
npm run db:deploy
npm run db:seed
USER_COUNT=$(mysql -u midas -p"$DB_PW" -N -e "SELECT COUNT(*) FROM User;" midas_learning_cloud)
[ "$USER_COUNT" -gt 0 ] || { echo "Seed produced no user accounts." >&2; exit 1; }
ok "${USER_COUNT} user accounts"

# ---------------------------------------------------------------------------
step "Frontend build"
cd "$APP_DIR/frontend"
npm ci --include=dev --no-audit --no-fund
npm run build
[ -f dist/index.html ] || { echo "Frontend build produced no index.html." >&2; exit 1; }
ok "dist/index.html built"

# ---------------------------------------------------------------------------
step "Starting the API under PM2"
cd "$APP_DIR"
pm2 delete midas-api >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --env production
sleep 4
if ! curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null 2>&1; then
  echo "The API is not answering on port 4000. Recent logs:" >&2
  pm2 logs midas-api --lines 40 --nostream || true
  exit 1
fi
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
ok "midas-api online and healthy"

# ---------------------------------------------------------------------------
step "nginx"
cat >/etc/nginx/sites-available/midas <<NGINXEOF
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
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host \$host;
    }
}
NGINXEOF
ln -sf /etc/nginx/sites-available/midas /etc/nginx/sites-enabled/midas
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
ok "serving ${APP_DIR}/frontend/dist"

# ---------------------------------------------------------------------------
step "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ok "22, 80 and 443 open - 4000 stays closed"

# ---------------------------------------------------------------------------
step "TLS certificate"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$RESOLVED" ]; then
  note "$DOMAIN does not resolve yet, so TLS was skipped."
  note "Point its DNS A record at this server, then run:"
  note "  certbot --nginx -d $DOMAIN --redirect -m $EMAIL --agree-tos"
  note "Until then login will not work: COOKIE_SECURE=true needs HTTPS."
else
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  certbot --nginx -d "$DOMAIN" --redirect --agree-tos -m "$EMAIL" \
    --no-eff-email --non-interactive
  pm2 restart midas-api --update-env >/dev/null
  ok "HTTPS live, auto-renewal scheduled"
fi

# ---------------------------------------------------------------------------
trap - ERR

printf '\n\033[1;32m================================================\033[0m\n'
printf '\033[1;32m  Done - https://%s\033[0m\n' "$DOMAIN"
printf '\033[1;32m================================================\033[0m\n\n'
printf 'Staff     password for all of these: Riverbank!2026\n'
printf '            nadia.okafor@riverbank.example     school admin\n'
printf '            tom.whitaker@riverbank.example     teacher, class 3A\n'
printf '            helen.mccormack@riverbank.example  curriculum manager\n\n'
printf 'Pupils    student code RVB-0001 upward, PIN 2468 - not an email\n\n'
printf 'Owner     owner@midas.local\n'
printf '            password: %s\n\n' "$(cat /root/.midas-owner-pw)"
printf 'WARNING   The staff password and pupil PIN are constants in the public\n'
printf '          repo (backend/prisma/seed/people.seed.ts). Treat this box as a\n'
printf '          demo; change them before any real pupil data goes in.\n\n'
printf 'Update    cd %s && ./scripts/deploy.sh\n' "$APP_DIR"
printf 'Logs      pm2 logs midas-api\n\n'
