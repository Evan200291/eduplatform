# First deploy to a bare IP (no domain)

Adapted from `DEPLOYMENT.md` for a bare IP. The differences that matter:

| | Domain deploy | This one |
|---|---|---|
| `COOKIE_SECURE` | `true` | **`false`** — no TLS, or login bounces you straight out |
| `COOKIE_DOMAIN` | `yourdomain.com` | **empty** — an IP in this field breaks cookies |
| TLS | certbot | none — certbot cannot issue for an IP |

**Everything, including passwords, travels in cleartext over plain HTTP.**
Fine for you testing. Not fine for real pupil data. Get a domain before that.

---

## 0. SSH in

```bash
ssh root@YOUR_SERVER_IP
```

Every block below runs on the server, in one session (some steps reuse shell
variables).

## 1. Install prerequisites

```bash
apt update && apt upgrade -y
apt install -y curl git nginx mysql-server ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
node -v && npm -v && nginx -v
```

## 2. Create the database

Generates its own password and saves it to `/root/.midas-db-pw` so step 4 can
read it back. You never type it.

```bash
DB_PW="$(openssl rand -hex 24)"
echo "$DB_PW" > /root/.midas-db-pw
chmod 600 /root/.midas-db-pw

mysql <<SQL
CREATE DATABASE IF NOT EXISTS midas_learning_cloud
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'midas'@'localhost' IDENTIFIED BY '${DB_PW}';
ALTER USER 'midas'@'localhost' IDENTIFIED BY '${DB_PW}';
GRANT ALL PRIVILEGES ON midas_learning_cloud.* TO 'midas'@'localhost';
FLUSH PRIVILEGES;
SQL

mysql -u midas -p"$DB_PW" -e "SELECT 'db ok';" midas_learning_cloud
```

## 3. Clone

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/Evan200291/eduplatform.git midas
cd midas
```

If the repo is private, GitHub will ask for a username and password — use a
personal access token as the password, not your account password.

## 4. Write backend/.env

**This is the only file you have to create.** Secrets are generated here, on
the server, so they never pass through a chat window or your clipboard.

```bash
cd /var/www/midas/backend

DB_PW="$(cat /root/.midas-db-pw)"
OWNER_PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
echo "$OWNER_PW" > /root/.midas-owner-pw
chmod 600 /root/.midas-owner-pw

cat > .env <<ENVEOF
NODE_ENV=production
PORT=4000

CORS_ORIGINS=http://YOUR_SERVER_IP
API_PUBLIC_URL=http://YOUR_SERVER_IP/api/v1
WEB_PUBLIC_URL=http://YOUR_SERVER_IP

DATABASE_URL="mysql://midas:${DB_PW}@localhost:3306/midas_learning_cloud?connection_limit=10&pool_timeout=20"

JWT_ACCESS_SECRET=$(openssl rand -hex 48)
JWT_REFRESH_SECRET=$(openssl rand -hex 48)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# No TLS on a bare IP. COOKIE_SECURE=true here would log you out instantly.
COOKIE_DOMAIN=
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax

ARGON2_MEMORY_COST=19456
ARGON2_TIME_COST=2
ARGON2_PARALLELISM=1

MAX_FAILED_LOGIN_ATTEMPTS=8
ACCOUNT_LOCK_MINUTES=15
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300

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

chmod 600 .env
grep -c . .env && echo ".env written"
```

`openssl rand -hex` is deliberate: hex output can't contain `/` `+` `=` (which
complicate a `DATABASE_URL`) and can't accidentally contain the words the
production guard in `src/config/env.ts:154` rejects.

## 5. Build, migrate, seed, start

```bash
cd /var/www/midas/backend
npm ci --include=dev
npm run build
npm test
npm run db:deploy
mkdir -p storage/uploads logs
npm run db:seed

cd /var/www/midas/frontend
npm ci --include=dev
npm run build

cd /var/www/midas
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup          # run whatever command it prints back

pm2 status
curl -s localhost:4000/api/v1/health && echo
```

`--include=dev` matters: `tsc`, `prisma` and `vite` are all devDependencies,
and npm omits them if `NODE_ENV=production` is exported in the shell.

## 6. nginx

```bash
cat > /etc/nginx/sites-available/midas <<'NGINXEOF'
server {
    listen 80 default_server;
    server_name _;

    root /var/www/midas/frontend/dist;
    index index.html;

    client_max_body_size 25M;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/midas /etc/nginx/sites-enabled/midas
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## 7. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

Port 4000 stays closed. nginx reaches the API over localhost.

## 8. Check it

```bash
curl -sI http://YOUR_SERVER_IP/ | head -3
curl -s  http://YOUR_SERVER_IP/api/v1/health && echo
echo "Owner password: $(cat /root/.midas-owner-pw)"
```

Then open **http://YOUR_SERVER_IP** in a browser.

---

## Logins

Created by `db:seed` with `SEED_DEMO_DATA=true`. The staff password and pupil
PIN are hardcoded constants in `backend/prisma/seed/people.seed.ts:27-28`, so
they are public in the GitHub repo — treat this box as a demo, not a service.

**Staff — email + password.** All use `Riverbank!2026`:

| Role | Email |
|---|---|
| School admin | `nadia.okafor@riverbank.example` |
| Curriculum manager | `helen.mccormack@riverbank.example` |
| Support agent | `sam.delgado@riverbank.example` |
| Teacher (class 3A) | `tom.whitaker@riverbank.example` |
| Teacher (class 4B) | `grace.mensah@riverbank.example` |
| Teacher (class 5C) | `daniel.ferreira@riverbank.example` |
| Teacher (no class) | `priya.raman@riverbank.example` |

**Pupils — student code + PIN**, not email. Codes `RVB-0001` upward, PIN `2468`.

**Platform owner** — `owner@midas.local`, password printed by step 8.
This one is generated per-install and is the only account not published in the
repo. It is also the only account that reaches the platform-staff surfaces.

---

## Updating later

```bash
cd /var/www/midas && ./scripts/deploy.sh
```

## If something breaks

```bash
pm2 logs midas-api --lines 60     # API errors
tail -50 /var/log/nginx/error.log # nginx errors
systemctl status mysql
```

| Symptom | Cause |
|---|---|
| 502 from nginx | API down — check `pm2 logs` |
| Login works then immediately logs out | `COOKIE_SECURE=true` in `.env` — must be `false` on HTTP |
| CORS error in the browser console | `CORS_ORIGINS` doesn't exactly match `http://YOUR_SERVER_IP` |
| `command not found: tsc` / `vite` | `npm ci` run without `--include=dev` |
| Refusing to start with placeholder secrets | The two JWT secrets are identical, or contain `changeme`/`secret`/`example` |
| 404 when refreshing a deep link | nginx `try_files` line missing |
