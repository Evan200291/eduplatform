# Progress log

One entry per working session. The point is that the next session starts from
here instead of re-deriving what the last one learned.

---

## 2026-09-14 (second round) — Frontend: PRD v2.5 decisions the website alone could finish

All checks pass in `frontend/`: typecheck, lint (the one old warning), 54 tests
(18 new), build. Signed-in screens were not clicked through in the browser —
the assistant cannot type passwords — so the manual steps are N1–N8 in
`TESTING-GUIDE.txt`. `PM-QUESTIONS.txt` at the repo root (not committed) holds
the questions for the PM, each with an example answer.

| PRD rule | What landed |
|---|---|
| Visible time limit only when deliberately set | `AssessmentPlayer` reads the attempt's `expiresAt`, shows a clock, closes the attempt as expired when it runs out |
| Age-differentiated hints and feedback | `QuestionCard` uses the learner's age mode; a wrong answer now waits for "Next question" |
| Simple time estimates | `formatAboutMinutes`; activity player and lesson reader. Path rows and set work are typed to show it once the server sends it |
| Never auto-approve | Settings no longer offers the switch and always saves "teacher decides"; Features will not turn `learning.path.autoApprove` on |
| Sign-out after inactivity | `routes/IdleSignOut.tsx` + `auth/idle.ts`, reads `sessionIdleMinutes`, one-minute warning, cross-tab via `localStorage` |
| CSV for teachers and classes | `ImportTools.tsx`: staff → invitations, classes → create + lead teacher, every row checked first (`users/import-rows.ts`, `lib/csv.ts`) |
| Urgent now, others in one business day | `content/moderation-targets.ts`; the queue shows and sorts by target |

Bug fixed: "Add a class" never sent `gradeId`, which the server requires, so it
always failed.

### Not done, and why

All need backend changes, and this session does not write to `backend/`:
removing the auto-approve job, password reset by email (also needs an email
service — there is none), audit alerts, per-learner due dates, hiding future
locked steps, one-sitting mode, cover access, the six moderation outcomes and
escalation job, students reading `sessionIdleMinutes` (they lack
`school.settings.read`), `estimatedMinutes` in the path-item and assignment
attempt selects, homework CSV. Mini-games, points cap, grades, trust reports and
preview still wait on the PM (PM-QUESTIONS.txt Part B).

---

## 2026-09-14 — Frontend: every remaining backend feature has a screen

Branch: `feat/content-authoring-and-moderation`, now on `origin`. All of the
following pass in `frontend/`: `npx tsc -b --noEmit`, `npx eslint src` (one
old warning in `OnboardingTour.tsx`), `npm test` (36 tests), and
`npm run build` (no chunk-size warning).

How to test it, page by page and with the seed logins: `TESTING-GUIDE.txt`
at the repo root. That file is gitignored because it holds credentials.

### Shipped since 09-09

| Area | What landed |
|---|---|
| Teacher: learners | Mastery override, teacher judgements, full notes workflow, answer-by-answer review and re-mark, recognition record with take-back and revoke, mission re-check |
| Teacher: classes and work | Class progress, streaks at risk, quiet buddies; recommendations raised by hand; path steps add/remove/reorder; plan paths for many learners, archive a path; add learners to set work |
| Learners | Start and hand in set work; report a problem; badges to earn; points history; buddy rename and diary; new-badge banner; stop a check part way; opening a step marks it started |
| Messages | Direct messages and announcements; unread count across the whole inbox; clear read ones |
| Content | Curriculum tree editing, lesson and activity editing, publish with a change record, objectives, version history, media library, ownership register, moderation decision log and proactive checks |
| Assessment | Reorder items |
| Admin | People, invitations and groups; gamification editors; mission and leaderboard archive; staff standings view; privacy and consent; data request edits; audit before/after and target history; feature rules and the "what would they see" explainer; terms, class archive, weekly subject minutes; switch branding back to default |
| Reporting | Saved reports (with the 40-character honesty notes), date window, CSV/Excel/PDF export, export history with download |
| Commercial | `/admin/agreements` — create, edit, renew, cancel agreements; plan comparison for schools |
| Support | Requester satisfaction rating; agent triage; category policy shown before raising |
| Platform | Overview tab, platform settings (secrets replace-only), incident summary and record editing, release note authoring; school settings from the school's page |
| Performance | Each surface is a lazy chunk; main bundle 936 KB → 448 KB |

### Bugs found and fixed on the way

- Editing an existing question's answers or hints was silently discarded (the
  question PATCH ignores nested rows).
- Term dates were read and written as `startsOn`/`endsOn`; the server uses
  `startsAt`/`endsAt`. Dates rendered blank and creating a term failed.
- Every incident route returns a wrapper; the ops page read it as a flat row,
  so incident titles and severities were blank.
- "Mark all read" counted only the current page.
- Several wrappers typed responses the server does not send (platform
  overview, setting catalogue, release notes, support policies).

### Things worth knowing

- `UNWIRED-ROUTES.md` was rewritten. What is left unused are single-record
  fetches whose data the list calls already return; each is listed with its
  reason.
- Logging in through the in-app browser was not possible in this session:
  the assistant cannot type passwords into sign-in forms. Screens were
  verified by typecheck, lint, tests, build and a check against the backend
  schemas. The click-through is `TESTING-GUIDE.txt`.

### Not done, and why

Unchanged from 09-09: organisation-level reporting (no org-level report
exists in the backend), backend authorisation tests (backend is out of this
session's scope), auto-approve removal, the daily points cap and mini-games
(all awaiting PM decisions), and SSO (not in the backend).

---

## 2026-09-09 — Frontend: reaching the routes the server already served

Branch: `feat/content-authoring-and-moderation` (6 commits, not yet merged or
pushed). Everything below passes `npm run typecheck`, `npm run lint`,
`npm test` and `npm run build` in `frontend/`.

### Shipped

| Area | What landed |
|---|---|
| Moderation | Admin queue at `/admin/moderation`: filters, review dialog, four decisions, notes required on anything but a dismissal |
| Question authoring | Questions, options and hints on any activity — create, edit, reorder, delete. Form adapts per question type |
| Lesson sections | Add, edit in place, reorder, delete |
| Academic | Grades and subjects edit and retire; class teacher assignment and subject list |
| Assignments | Target the whole class or named learners (was class-only) |
| Support | `/admin/support` — the whole ticket workflow, one screen for requester and agent |
| Platform ops | `/admin/platform` — job health, run log, incidents, releases |
| Branding | School logo upload with preview |
| Accessibility | Dyslexia-friendly text toggle (spacing + typeface) |
| Student | Locked path steps now say *why* they are locked |
| Users | Bulk import accepts a CSV file (header row, quoted fields, CRLF handled) |
| Testing | 36 frontend tests, 4 files; CI workflow for both apps |

### Things worth knowing before touching this code

- **`UNWIRED-ROUTES.md` over-reports.** Its parser only sees calls made through
  the standard request helpers, so anything using raw `fetch` reads as unwired.
  The report-export download was listed as missing and works fine. Verify each
  item against the source before planning work from it.
- **`apiDeleteReturning`** was added to `api/request.ts`. Content-authoring
  DELETE routes answer 200 with the deleted row, not 204.
- **The enum mirror in `types/enums.ts` is incomplete** and nothing enforces it.
  `PathItem.reason` and the whole moderation vocabulary were missing until this
  session. Assume a field exists server-side before concluding it does not.
- **Frontend tests run in jsdom** (`vite.config.ts` → `test`). The preference
  store touches `document` and `localStorage` at module scope, so a node
  environment cannot load it.

### Not done, and why

| Item | Status |
|---|---|
| Organisation-level reporting | **Blocked on backend.** `ORGANIZATION` is a valid scope and the permission exists, but no report definition uses it and `reporting.reports.ts` has no org-level report. Building a client-side aggregate would mean inventing a metric the product does not define |
| Authorisation / integration tests | **Blocked here.** They belong in `backend/`, which this session does not write to. These are the tests that would demonstrate tenant isolation — the most valuable ones outstanding |
| Recommendation auto-approve removal | Backend, and awaiting a PM decision |
| Daily points cap | Backend field + enforcement, awaiting a default value from the PM |
| Mini-games | Awaiting the PM decision: build a player or withdraw the two activity types |

### Next session should pick up

1. Merge or push this branch — it has never left the machine.
2. Content ownership screen (UX brief N3) — `/content-ownership` routes are live
   and unreached; five ownership categories.
3. Recommendation drill-in, badge/reward editing, mission edit and cancel — the
   remaining create-only screens.
4. A page-by-page manual pass of `/learn` and `/admin`, which `AUDIT-PROMPT.md`
   notes have never had one.
