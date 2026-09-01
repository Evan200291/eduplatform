# Midas Learning Cloud — Full-Platform Issue Audit

You are acting as a **project manager and QA lead**. Find and report **every**
defect across this platform. You are **not** fixing anything in this pass — you are
producing an actionable, prioritised defect register an engineer can work straight
from.

Repo root: `E:\games\edu_platform`
- `backend/` — Express + TypeScript + Prisma + MySQL. API base `http://localhost:4000/api/v1`
- `frontend/` — Vite + React + TS + TanStack Query + Tailwind. `http://localhost:5173`

Dev servers are usually already running. Do **not** kill or restart them blindly.

> **Why this audit exists.** A human tester clicked through only the `/teach` pages
> and found five real bugs in minutes — crashes, dead buttons, blank data. The
> `/admin` and `/learn` surfaces have **not** had that treatment. Assume they carry
> the same defects and go find them.

---

## Ground rules

1. **Evidence, not impressions.** Every finding cites a file path + line, or a
   reproducible request/response. "The dashboard feels unfinished" is not a
   finding. "`LearningPathsPage.tsx:61` reads `row.summary.completionPercent`, but
   `learning.service.ts:39` `PATH_LIST_SELECT` never returns `summary`" is.
2. **Never invent findings.** If you could not verify something, mark it
   `UNVERIFIED` and say what blocked you. A short honest register beats a padded
   one. Do not inflate the count.
3. **Do not type passwords or credentials into any login form.** If a check needs a
   signed-in session, mark it `NEEDS-SESSION` and write the exact click-path
   someone should follow once logged in.
4. **Read-only.** No source edits, no migrations, no data mutations. You may run
   `tsc`, `eslint`, `vite build`, `prisma migrate status`, and read-only DB reads.
5. Ignore `scratchpad/` (generated artefacts) and `AUDIT-PROMPT.md` (this file).
6. Work **breadth-first**. Cover every page shallowly before going deep on any one.
   A register covering all 40 pages at 70% depth is far more useful than 5 pages at
   100%.

---

## Part 1 — The two bug patterns that produced every defect found so far

Five real defects were found recently. **All five were instances of just two
patterns.** These are your highest-yield hunting grounds. Work these first.

### PATTERN A — frontend type promises a field the backend never sends
**Symptom:** hard crash, `Cannot read properties of undefined (reading 'x')`, or
silently blank UI.

**Root cause:** frontend types are hand-written, not generated from Prisma, so they
drift from the actual `select` clauses.

Four confirmed real instances — use these as your template:

| # | Where | The lie | Consequence |
|---|---|---|---|
| 1 | `listPaths` vs detail | List select had no `summary`; only the *detail* endpoint computed it. One shared type declared `summary` as always present. | `/teach/paths` crashed on every row |
| 2 | `requirePath` guard | Shared access guard selected scalar columns only — no `subject`/`student` relations. | `/teach/paths/:id` crashed on `data.subject.name` |
| 3 | `listRoster` | Returned `{id: membershipId, user: {...}}`; type declared a **flat** student with `displayName` at top level. | Blank names on every roster row **and** every student link built from the *membership* id — pointing at the wrong entity |
| 4 | `listRoster` | Type declared `nickname`; the select never included it. | Search-by-nickname silently never matched |

**Method — do this exhaustively:**

For **every** exported function in every `frontend/src/**/*.api.ts`:
1. Note the URL it calls and its declared return type.
2. Open the backend route for that URL, follow it to the service function, and find
   the Prisma `select` / the object literally returned.
3. Diff **field by field** against the TypeScript interface.
4. Then grep the UI for reads of any field that turns out to be missing or nested
   differently.

Specific traps proven to exist here:
- **List vs detail divergence.** The same entity is often served by two endpoints
  with *different* shapes behind *one* shared type. Check both.
- **Shared guard helpers** (`requireX`) that select scalars only, whose result is
  spread into a response the client expects to be richer.
- **Nested vs flat.** `{ user: {...} }` vs flat. Check `user`, `student`, `subject`,
  `topic`, `attempt`, `assignment`, `class`, `organization`.
- **Wrong id.** When a row wraps an entity (membership → user, attempt → student),
  confirm the UI uses the *entity* id for links/mutations, not the wrapper's.
- **Nullable relations** read without optional chaining.
- **`as unknown as` / `as never` / `@ts-expect-error`** — every one marks a place
  someone silenced a real mismatch. Grep for them and treat each as a suspect.
- **Enum drift.** Frontend union types vs Prisma enums. A known past example:
  backend `PENDING_APPROVAL` vs frontend `'PENDING'`. Diff every union in
  `frontend/src/**/*.types.ts` against `backend/prisma/schema/*.prisma`.

### PATTERN B — backend capability with no frontend caller
**Symptom:** "this page does nothing", "I can't add X".

Confirmed instances: class roster add/remove endpoints existed from day one with no
API function or UI (nobody could enrol a student); `PATCH /users/me` existed but
nothing called it (students could edit nothing about themselves).

**Method:** enumerate every route in every `*.routes.ts` (list in Part 2), then grep
all of `frontend/src/**/*.api.ts` for each path. Report every route with **zero**
callers, and judge whether a user would reasonably expect to reach it.

**Also check the inverse:** frontend API functions calling routes that **do not
exist** server-side. A confirmed real case: `excuseAttempt`/`unexcuseAttempt` POST
to paths with no matching route — they 404 if ever called.

### PATTERN C — server-side validation the form cannot satisfy
**Symptom:** "Some details need fixing" with no visibly wrong field; button appears
dead.

Confirmed instance: the recommendation decide endpoint requires `appliedChange` when
the decision is `MODIFY`; the form never sent it, so MODIFY always failed on a field
the UI did not have. Separately, `REJECT` required a note while the field was
labelled "optional".

**Method:** for every Zod schema with `.superRefine(...)`, `.refine(...)`, or a
conditionally-required field, open the corresponding form and confirm it (a)
collects that data, (b) sends it, and (c) marks it required in the UI. A field the
server requires but the form calls optional is a defect.

---

## Part 2 — Complete inventory. Cover every item.

### Backend route modules (27)
```
academic  assessment  assignments  auth  companion
content (content.routes, content.activities, content.governance, media)
curriculum  dashboard
gamification (gamification, gamification.points, gamification.rewards)
leaderboard  learning  missions  notifications  platform  privacy
progress  rbac/roles  reporting  subscription  support  tenancy  theme  users
```

### Mounted API paths (49) — each must be traced to a frontend caller or reported
```
/activities /assessment-attempts /assessment-responses /assessments /assignments
/audit /auth /classes /companion /consent /content-moderation-reviews
/content-ownership /content-publications /content-reports /curriculum /dashboard
/data-requests /entitlements /gamification /grades /invitations /leaderboards
/learning-paths /lessons /mastery /media /missions /notes /notifications
/organizations /platform /progress /public /public/media /questions
/recommendations /reports /retention-policies /roles /schools /subjects
/subscriptions /support /teacher-assessments /terms /themes /topic-evaluations
/user-groups /users
```

> **Starting lead:** there are 22 frontend `*.api.ts` files for 49 mounted paths.
> Several mounts have **no obvious frontend module at all** — `/support`,
> `/platform`, `/content-reports`, `/content-moderation-reviews`,
> `/content-ownership`, `/content-publications`, `/topic-evaluations`,
> `/teacher-assessments`, `/questions`, `/notes`, `/invitations`, `/mastery`.
> Confirm each: genuinely unused, reachable another way, or a real Pattern-B gap.

### Frontend API modules (22)
```
academic assessment assignments auth companion content curriculum dashboard
entitlements gamification leaderboard learning missions notifications privacy
progress reporting roles subscription tenancy theme users
```

### Type modules (22) — diff every one against its backend source
```
academic assessment assignments auth companion content curriculum dashboard
entitlements gamification leaderboard learning missions notifications privacy
progress reporting roles subscription tenancy theme users
```

### Every page — check all of them

**Admin (18 routes)** — `/admin` + `users`, `users/:userId`, `roles`, `academic`,
`curriculum`, `assessment`, `gamification`, `branding`, `features`, `settings`,
`analytics`, `billing`, `audit`, `organizations`, `organizations/:orgId`,
`schools`, `schools/:schoolId`

**Teacher (12 routes)** — `/teach` + `classes`, `classes/:classId`, `students`,
`students/:studentId`, `paths`, `paths/:pathId`, `assignments`,
`assignments/:assignmentId`, `recommendations`, `reports`, `notifications`

**Student (11 routes)** — `/learn` + `profile`, `notifications`, `activities`,
`activities/:activityId`, `screening`, `missions`, `companion`, `leaderboard`,
`progress`

**Auth / account / system** — login, change-password, accept-invitation,
preferences, sessions, 403, 404, feature-preview

> Detail routes (`:userId`, `:pathId`, `:studentId`, `:classId`, `:assignmentId`,
> `:orgId`, `:schoolId`, `:activityId`) are **where two of the four Pattern-A bugs
> lived.** Do not skip them because they need an id — pull a real id from the
> database and check the shape the endpoint returns.

### Per-page checklist
For each page record:
- [ ] Renders without console error or ErrorBoundary trip
- [ ] Every button/link traced to a real mutation or navigation (not a no-op)
- [ ] Every mutation's payload satisfies the server's Zod schema (Pattern C)
- [ ] Loading, empty, and error states all handled
- [ ] Paginated if its endpoint is paginated; page resets when filters change
- [ ] Every field it reads is actually returned by the endpoint (Pattern A)
- [ ] Permission-gated controls hidden *and* enforced server-side
- [ ] No layout overflow at narrow widths

---

## Part 3 — Systemic checks

### Build and schema health
```bash
cd frontend && npx tsc -b --noEmit && npx vite build
cd backend  && npx tsc --noEmit && npx prisma migrate status
cd frontend && npx eslint src
```
Report anything non-clean. Note: a clean `tsc` proves nothing about Pattern A —
the types are *wrong*, so they typecheck happily. Say so if asked.

### Dead and orphaned code
- Prisma models / enum values with zero references in `frontend/src`.
- Exported API functions with zero callers.
- Components/pages not reachable from any route.
- Stray HTML entry points beside `index.html` (auth-bypassing dev harnesses have
  been committed here before — check for any file faking a permissioned session).

### Data integrity (read-only)
Distinguish "no UI" from "no data" — different fixes, both real. For core tables
(users, classes, memberships, learning paths + items, recommendations, assignments,
attempts, activities, badges, missions, notifications, leaderboards) report row
counts, and flag anything that will make a page look broken purely from emptiness.
Known example: seeded learning-path items never set `activityId`, so activity
renderers are unreachable through normal navigation despite working correctly.

### UX and layout
- Horizontal overflow; controls that do not fit inside narrow cards. **Note CSS
  breakpoints read the viewport, not the container** — a narrow card on a wide
  screen still gets the "wide" layout. This has been a real bug here.
- The same concept styled or placed inconsistently across pages.
- Destructive actions without confirmation.
- Error messages that expose raw ids/stack traces instead of explaining the fix.

### Accessibility
Missing focus rings, removed `aria-*`, colour as the only signal, contrast below AA,
touch targets under 44px, images/icons without accessible names.

### Security
- Permission enforced server-side, not only hidden in the UI. Spot-check by calling
  a privileged route directly and confirming it rejects.
- Secrets in logs, URLs, or client bundles.
- Any dev/preview harness that bypasses auth.

---

## Output format

One markdown register, ordered by severity:

```
### [SEV-1] <short title>
- **Where:** path/to/file.ts:123  (+ API route if relevant)
- **What:** one or two sentences on the defect
- **Repro / evidence:** the request, query, or code path proving it
- **Impact:** what a real user experiences
- **Fix sketch:** the smallest correct change
- **Confidence:** CONFIRMED | LIKELY | UNVERIFIED
```

**Severity:**
- **SEV-1** — crash, data loss, security, or a core workflow that cannot complete
- **SEV-2** — a feature is unreachable or silently fails
- **SEV-3** — confusing UX, inconsistency, missing empty/error state
- **SEV-4** — cosmetic / polish

**End the report with:**
1. **Counts by severity**, plus counts by pattern (A / B / C / other).
2. **Coverage table** — every page from Part 2 with `CHECKED` / `NEEDS-SESSION` /
   `NOT-CHECKED`. Be honest; gaps here are the point.
3. **Top 10 to fix first**, ordered by user impact ÷ effort.
4. **Systemic recommendations** — root causes worth fixing once rather than
   symptom-by-symptom. (Generating frontend types from the Prisma schema instead of
   hand-writing them would have prevented all four Pattern-A bugs; say so if your
   findings support it.)
5. **What you could not check**, and exactly what is needed to check it.

Be blunt. An unreported defect is worse than an unflattering report.
