# Deploying to a VPS

Ubuntu 22.04/24.04, nginx in front, PM2 running the API, MySQL local.

**Architecture**

```
              ┌──────────── nginx (443, TLS) ────────────┐
   browser ──▶│  /            → frontend/dist  (static)  │
              │  /api, /media → localhost:4000 (proxy)   │
              └──────────────────┬───────────────────────┘
                                 ▼
                    PM2 · midas-api · node dist/server.js
                                 ▼
                              MySQL
```

nginx serves the built frontend directly — it is faster at static files and
terminates TLS. PM2 only runs the API.

---

## 1. Server setup (once)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx mysql-server

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2
node -v && npm -v
```

## 2. Database (once)

```bash
sudo mysql_secure_installation
sudo mysql
```

```sql
CREATE DATABASE midas_learning_cloud
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'midas'@'localhost' IDENTIFIED BY 'PUT_A_REAL_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON midas_learning_cloud.* TO 'midas'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 3. Clone

```bash
sudo mkdir -p /var/www && sudo chown -R $USER:$USER /var/www
cd /var/www
git clone https://github.com/Evan200291/eduplatform.git midas
cd midas
```

## 4. Configure the API

```bash
cd /var/www/midas/backend
cp .env.example .env
```

Generate two **different** secrets:

```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -base64 48)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"
```

Then edit `.env` — these are the lines that must change from the example:

```ini
NODE_ENV=production
PORT=4000

# No trailing slash. Must be the real domain or CORS and cookies will fail.
CORS_ORIGINS=https://yourdomain.com
API_PUBLIC_URL=https://yourdomain.com/api/v1
WEB_PUBLIC_URL=https://yourdomain.com

DATABASE_URL="mysql://midas:YOUR_DB_PASSWORD@localhost:3306/midas_learning_cloud?connection_limit=10&pool_timeout=20"

JWT_ACCESS_SECRET=<paste the first generated value>
JWT_REFRESH_SECRET=<paste the second, different value>

# Refresh token is an httpOnly cookie — these three must be right over HTTPS.
COOKIE_DOMAIN=yourdomain.com
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax

STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage/uploads

BOOTSTRAP_OWNER_EMAIL=you@yourdomain.com
BOOTSTRAP_OWNER_PASSWORD=<a real password, not the placeholder>
BOOTSTRAP_OWNER_NAME=Your Name

# false on a real server. See the warning below.
SEED_DEMO_DATA=false

LOG_LEVEL=info
LOG_FORMAT=json
```

> ### Read this before seeding
>
> **`SEED_DEMO_DATA=true` creates a demo school with passwords that are visible
> in this public repository** (`backend/prisma/seed/people.seed.ts` — staff
> password and student PIN are source constants). On an internet-reachable
> server that is an open door. Keep it `false` unless the box is firewalled off
> and you are only demoing.
>
> **`BOOTSTRAP_OWNER_PASSWORD` must not be the placeholder.** The seed rejects
> anything matching `change-me` / `password123`, so bootstrap will fail loudly
> rather than create a weak owner account. That is intentional.

## 5. Build and start

```bash
cd /var/www/midas

# API
cd backend
npm ci --include=dev   # tsc/prisma/vite are devDependencies — see note below
npm run build          # prisma generate + tsc -> dist/
npm test               # 171 unit tests, no database needed, ~4s
npm run db:deploy      # applies migrations (never `db:migrate` in production)
mkdir -p storage/uploads logs

# Frontend
cd ../frontend
npm ci --include=dev
npm run build          # -> frontend/dist

# Start the API under PM2
cd /var/www/midas
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup            # run the command it prints, so PM2 survives reboot

pm2 status
pm2 logs midas-api --lines 50
```

> **`npm ci --include=dev` is not optional here.** The build tools — `tsc`,
> `prisma`, `vite` — are all devDependencies. If `NODE_ENV=production` is
> exported in your shell, a plain `npm ci` omits them and the build fails with
> a confusing "command not found". The flag makes it work either way.

If this is a fresh database and you skipped the demo seed, create the owner
account:

```bash
cd /var/www/midas/backend
npx tsx prisma/seed.ts     # honours SEED_DEMO_DATA=false — owner only
```

## 6. nginx

```bash
sudo nano /etc/nginx/sites-available/midas
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /var/www/midas/frontend/dist;
    index index.html;

    client_max_body_size 25M;      # must be >= MAX_UPLOAD_BYTES

    # SPA: unknown paths return index.html so client routing works on refresh.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-cache hashed build assets; never cache index.html.
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

    # Uploaded media is served by the API from local disk.
    location /media/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/midas /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 7. TLS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Certbot rewrites the nginx file for 443 and sets up renewal.

**`COOKIE_SECURE=true` only works over HTTPS.** If you set it before TLS is
live, sign-in will appear to succeed and then immediately log you out — the
browser silently drops the refresh cookie.

## 8. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Port 4000 stays closed — nginx reaches the API over localhost.

---

## Updating after a `git push`

```bash
cd /var/www/midas
./scripts/deploy.sh
```

That script pulls, installs, builds, migrates and reloads PM2. See
`scripts/deploy.sh`.

---

## Operations

```bash
pm2 status
pm2 logs midas-api          # live
pm2 logs midas-api --err    # errors only
pm2 restart midas-api
pm2 monit

curl -s localhost:4000/api/v1/health
```

Log files: `backend/logs/api-out.log`, `backend/logs/api-error.log`.

### Backups

Nothing is automatic. At minimum, a nightly dump:

```bash
sudo crontab -e
```

```cron
0 3 * * * mysqldump -u midas -p'YOUR_DB_PASSWORD' midas_learning_cloud | gzip > /var/backups/midas-$(date +\%F).sql.gz
0 4 * * 0 find /var/backups -name 'midas-*.sql.gz' -mtime +30 -delete
```

Also back up `backend/storage/uploads` — uploaded media lives only on this disk.
**Local storage means this server is a single point of failure for media.** Fine
for a pilot; revisit before multiple schools depend on it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| 502 from nginx | API is down — `pm2 logs midas-api` |
| Sign-in succeeds then logs straight back out | `COOKIE_SECURE=true` without HTTPS, or `COOKIE_DOMAIN` not matching the real domain |
| CORS errors in console | `CORS_ORIGINS` missing the domain, or has a trailing slash |
| 404 on refreshing a deep link | `try_files ... /index.html` missing from nginx |
| `PrismaClientInitializationError` | `DATABASE_URL` wrong, or MySQL not running |
| Migrations "already applied" but tables missing | Wrong database in `DATABASE_URL` |
| Uploads fail | `storage/uploads` missing or not writable; or `client_max_body_size` below `MAX_UPLOAD_BYTES` |
| Bootstrap fails on first run | `BOOTSTRAP_OWNER_PASSWORD` still the placeholder — intentional |

---

## Before real schools use this

Honest list of what this deployment does **not** yet give you:

1. **Thin test coverage, no CI.** 171 backend unit tests cover pure logic
   (pricing, points, theme tokens, export formats). There are **no route tests,
   no database tests, and no frontend tests at all**, and nothing runs
   automatically on push. Every crash found so far was found by clicking, not
   by a test.
2. **Media on local disk** — no redundancy; the backup above is manual.
3. **No error tracking** — structured logs only, no alerting. Consider Sentry.
4. **Single API process** — cluster mode is commented out in
   `ecosystem.config.cjs` and needs verification first.
5. **Retention periods are placeholders** — a compliance question, not a
   technical one.
