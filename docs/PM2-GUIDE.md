# PM2, step by step

PM2 keeps the Midas API (`midas-api`) running: it starts it, restarts it if it crashes, and brings it
back after a reboot. nginx serves the website files and forwards `/api` to it.

> The tables below show **what you should see**. Ports, ids, memory and times will differ on your server.
> On a shared VPS your list will also contain the *other* apps — that is normal; every command here names
> `midas-api`, so the others are never touched.

## 0. Before you start — look at what is already there

```bash
pm2 status
```
```
┌────┬──────────────┬─────────┬──────┬──────────┬────────┬─────────┬──────────┐
│ id │ name         │ mode    │ ↺    │ status   │ cpu    │ memory  │ user     │
├────┼──────────────┼─────────┼──────┼──────────┼────────┼─────────┼──────────┤
│ 0  │ other-app    │ fork    │ 0    │ online   │ 0%     │ 85.2mb  │ root     │
└────┴──────────────┴─────────┴──────┴──────────┴────────┴─────────┴──────────┘
```
Write down which ports those apps use: `ss -ltnp | grep node`. The installer picks a free one for you.

## 1. Install PM2 (only if `pm2 -v` fails)

```bash
npm install -g pm2
pm2 -v
```

## 2. Start the API

`vps-add-site.sh` does this for you. By hand:

```bash
cd /var/www/midas
pm2 start ecosystem.config.cjs --env production
pm2 status
```
```
│ 0  │ other-app    │ fork    │ 0    │ online   │ 0%     │ 85.2mb  │ root     │
│ 1  │ midas-api    │ fork    │ 0    │ online   │ 0%     │ 62.4mb  │ root     │
```
`status` must be **online** and `↺` (restarts) must stay at **0**.

## 3. Check it is really answering

```bash
PORT=$(grep -E '^PORT=' backend/.env | cut -d= -f2)
curl -s localhost:${PORT:-4000}/api/v1/health
pm2 logs midas-api --lines 30 --nostream
```
You should get a small JSON health reply, and the log should end with the server listening.

## 4. Save the list so it survives a reboot

```bash
pm2 save
pm2 startup          # prints one `sudo env PATH=… pm2 startup systemd …` line — run that line once
```
On a shared server `pm2 startup` was probably done already; `pm2 save` is still needed so `midas-api` is
in the saved list. (The installer backs up the old `dump.pm2` first.)

## 5. Status words and what to do

| status | meaning | do this |
|---|---|---|
| `online` | running | nothing |
| `launching` | starting up | wait 5 s, run `pm2 status` again |
| `errored` | crashed repeatedly | `pm2 logs midas-api --err --lines 50` — usually a bad `backend/.env` or the database being unreachable |
| `stopped` | stopped by someone | `pm2 start midas-api` |
| `↺` keeps climbing | crash loop | same as `errored` |

## 6. Everyday commands (all scoped to `midas-api`)

```bash
pm2 status                       # all apps
pm2 show midas-api               # path, port env, restarts, log files
pm2 logs midas-api               # live logs (Ctrl+C to leave)
pm2 logs midas-api --err         # errors only
pm2 reload midas-api --update-env   # zero-downtime restart after a change
pm2 restart midas-api            # hard restart
pm2 stop midas-api               # stop only ours
pm2 monit                        # live CPU / memory
```

## 7. After an update

```bash
cd /var/www/midas
./scripts/deploy.sh              # pull, build, migrate, then `pm2 reload midas-api`
pm2 status                       # still online, ↺ unchanged
```

## 8. Never run these on a shared server

`pm2 kill`, `pm2 delete all`, `pm2 stop all`, `pm2 restart all`, `pm2 flush` — they act on every app.
