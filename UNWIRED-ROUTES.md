# Backend routes with no frontend caller — verified list

**Method:** the backend side is *ground truth*, walked from Express's own router
stack at runtime (not grepped). The frontend side is parsed from every
`*.api.ts`, resolving template literals and const path maps (e.g.
`RESOURCE.programs`) before comparing.

**Totals:** 395 registered routes · 273 distinct frontend calls · **~115 genuinely
unreached** after discounting the artifacts listed at the bottom.

> ## Correction to the earlier Haiku audit
> That audit reported "120 of 222 routes unused (54%)". Both numbers were wrong:
> it discovered only 222 of the 395 registered routes, and it produced false
> positives — it listed `theme /:id/activate`, `/:id/publish`, `leaderboard
> /:id/archive`, `/:id/opt-out`, and `missions /:id/enrol` as unreachable when
> `activateTheme`, `publishTheme`, `archiveLeaderboard`, `recomputeLeaderboard`
> and `setLeaderboardOptOut` all exist and are called. It also reported every
> route's method as `GET`, which means its method parsing failed.
> Do not plan work from that list; use this one.

---

## Tier 1 — whole product surfaces with no UI at all

These are not stray endpoints; each is a complete, coherent feature the backend
fully implements and the frontend never touches.

### `/platform` — 19 routes. Platform operations console.
```
GET/PUT/DELETE  /platform/settings, /settings/*, /settings/catalogue
GET/POST/PATCH  /platform/incidents, /incidents/*, /incidents/*/status,
                /incidents/severities, /incidents/summary
GET/POST/PATCH  /platform/releases, /releases/*
GET             /platform/jobs, /jobs/health, /platform/overview
```
There is **no `platform.api.ts`**. Permissions for all of it already exist
(`platform.overview.read`, `platform.incidents.write`, `platform.jobs.read`, …).
PRD ch. 05 describes a platform panel; this is it, unbuilt.

### `/support` — 14 routes. Support ticketing.
```
GET   /support/policies, /support/summary, /support/requests, /requests/*,
      /requests/*/messages
POST  /support/requests, /requests/*/{assign,close,escalate,messages,
      resolve,satisfaction,status,triage}
```
No `support.api.ts`. Permissions exist (`support.create`, `support.read.own`,
`support.read.all`, `support.respond`, `support.assign`). The admin overview
already renders an "Open support tickets" figure that links nowhere. PRD ch. 13.

### Content moderation — 9 routes across four mounts.
```
GET/POST  /content-reports, /content-reports/*, /content-reports/*/resolve
GET/POST  /content-moderation-reviews
GET/PUT   /content-ownership
GET       /content-publications
```
Settings already exposes a "Moderation required" toggle with no queue behind it.
PRD ch. 05 (safety and moderation) requires this.

---

## Tier 2 — sub-resource CRUD missing from otherwise-working pages

The parent page exists and works; these child operations have no UI, so the
content model cannot actually be authored end-to-end.

| Area | Missing | Consequence |
|---|---|---|
| `/activities/*/questions` (7) | question CRUD + reorder, versions, objectives | an activity's questions can't be authored in-app |
| `/questions/*/options`, `/hints` (6) | option + hint CRUD | can't build or edit a question's answers |
| `/lessons/*/sections` (4) | section CRUD + reorder | lesson bodies can't be edited |
| `/curriculum/*/reorder`, prerequisites, objectives (6) | ordering + prerequisites | curriculum order is fixed at seed time |
| `/learning-paths/*/items` (6) | add/remove/reorder items, refresh-unlocks | a teacher can't restructure a path |
| `/classes/*/teachers`, `/subjects` (6) | teacher assignment, subject mapping | can't staff a class |
| `/grades/*`, `/subjects/*` (6) | detail, update, archive | create-only; no edit or archive |
| `/assignments/*` (4) | excuse, unexcuse, sync-attempts, PUT targets | **note:** frontend `excuseAttempt`/`unexcuseAttempt` POST to `/assignments/attempts/*/excuse`, which does not exist — the real route is `/assignments/*/excuse`. These two functions 404 if called. |
| `/gamification` (3) | badge/reward PATCH, streaks list | badges/rewards are create-and-archive only, no edit |
| `/missions/*` (2) | PATCH, cancel | missions can't be edited or cancelled |
| `/companion` (2) | roster, grant | can't grant a companion |
| `/teacher-assessments` (2) | list, update | write-only today |
| `/recommendations` (3) | detail, summary, manual create | queue only; no drill-in |
| `/reports` (2) | standard-report run, export download | **the export a user generates cannot be downloaded** |
| `/progress/classes/*` (1) | class progress summary | teacher class-level view missing |
| `/roles/*` DELETE (1) | revoke by assignment id | grant works, revoke path unused |
| `/consent/effective`, `/data-requests/*/export` (2) | privacy reads | compliance surface incomplete |
| `/assessment-attempts/*/responses`, `/assessment-responses/*/override` (2) | response review + override | teacher can't override a mark |

---

## Discount these — analysis artifacts, not gaps

Roughly 24 entries in the raw output are false positives:

* **Auth routes** (`/login`, `/logout`, `/refresh`, `/me`, `/change-password`,
  `/accept-invitation`, `/sessions`) — Express's compiled regexp for that router
  didn't yield its `/auth` prefix, so they appear unprefixed. All are called.
* **`/public/schools/*/theme.css`** — loaded by the login page as a `<link>`
  stylesheet, not through an `api.ts` function.
* **`/health`** — infrastructure probe, no UI expected.
* **`/*`-prefixed entries** (8) — nested routers whose mount prefix wasn't
  recovered (`/users/*/credentials`, `/*/roles`, `/*/status`, `/*/moderate`, …).
  Resolve individually before treating as gaps.

---

## Suggested order of work

1. **Fix the 404 bug first** — `excuseAttempt`/`unexcuseAttempt` point at
   non-existent paths. Small, and it's a live defect rather than a gap.
2. **Report export download** — users can already generate an export they then
   cannot retrieve. Worst ratio of user-visible breakage to effort.
3. **Content moderation queue** — a child-safety surface the PRD requires and
   Settings already advertises.
4. **Support ticketing** — self-contained, and the admin overview already links
   toward it.
5. **Content authoring sub-CRUD** (questions, options/hints, lesson sections) —
   without these the platform can't author its own content.
6. **Platform operations console** — largest, and only matters to platform staff.
