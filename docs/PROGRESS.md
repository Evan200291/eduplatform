# Progress log

One entry per working session. The point is that the next session starts from
here instead of re-deriving what the last one learned.

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
