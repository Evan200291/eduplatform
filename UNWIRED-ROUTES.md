# Backend routes with no frontend caller

**Updated 17 September 2026.** A full sweep this round checked three things,
not just this list: every exported `*.api.ts` function against the rest of
`frontend/src`, every backend route's most specific path segment against every
`.api.ts` file, and every frontend page component against the `*.routes.tsx`
files. One real gap turned up — `POST /assignments/:id/sync-attempts` had no
frontend wrapper at all, not even an unused one — and is now wired into
`AssignmentDetailPage` as "Sync new learners". Two routed pages had no link
pointing at them anywhere in the app (`/learn/screening`, `/learn/profile`);
see `docs/PROGRESS.md` for how those were fixed. This replaces the 14
September list.

## How this was checked

Every function exported from `frontend/src/**/*.api.ts` was searched for across
the rest of `frontend/src`. An exported wrapper that nothing imports is a route
no screen reaches. The check is a grep, so re-run it before planning work from
this file.

## Still unused, and why that is fine

Each of these fetches a single record that a list call already returns in full.
Wiring them would add a second request for data already on screen.

| Wrapper | Route | Why not used |
|---|---|---|
| `fetchAssessmentItems` | `GET /assessments/:id/items` | `fetchAssessment` returns the items |
| `fetchAttempt` | `GET /assessment-attempts/:id` | The list and the next-item loop carry the attempt |
| `fetchContentReport` | `GET /content-reports/:id` | The moderation list rows are complete |
| `fetchProgram`, `fetchUnit` | `GET /programs/:id`, `/units/:id` | The curriculum tree returns them |
| `fetchBadge` | `GET /gamification/badges/:id` | The badge list rows are complete |
| `fetchMission` | `GET /missions/:id` | The mission list rows are complete |
| `fetchRecommendation` | `GET /recommendations/:id` | The recommendation list rows are complete |
| `fetchIncident` | `GET /platform/incidents/:id` | The incident list returns the same view |
| `fetchDataRequest` | `GET /data-requests/:id` | The list rows are complete |
| `fetchReportDefinition` | `GET /reports/definitions/:id` | The list rows are complete |
| `fetchSubscription`, `fetchSubscriptionPackaging` | `GET /subscriptions/:id`, `/:id/packaging` | The agreements list and `/plans` cover both |
| `fetchCurrentSeats` | `GET /subscriptions/current/seats` | `/subscriptions/current` already includes seats |
| `fetchTheme` | `GET /themes/:id` | The theme list rows are complete |
| `fetchSupportMessages` | `GET /support/requests/:id/messages` | The request detail includes its messages |
| `fetchFeatureRegistry`, `fetchFeatureDefinition`, `fetchFeatureDefinitions` | `GET /platform/features` | The Features screen uses `/entitlements/features`, which adds what each feature resolves to |
| `fetchProgress`, `fetchMasteryRecords` | `GET /progress`, `/mastery` | Superseded by the per-learner and per-class progress routes the screens use |
| `fetchDashboardDispatch`, `fetchAttentionDashboard` | `GET /dashboard`, `/dashboard/attention` | Each surface calls its own dashboard directly; the teacher dashboard includes the attention list |
| `fetchCompanionSummary` | `GET /companion/summary` | The companion roster and learner companion calls cover it |
| `fetchGamificationConfig` | `GET /gamification/config` | Streak, companion and points rules are edited through their own routes |
| `mediaFileUrl` | `GET /media/:id/file` | Media is fetched with the bearer token (`fetchAuthorizedBlob`), not by URL |
| *(no wrapper — reached by URL)* | `GET /themes/active.css` | `themeStylesheetUrl()` builds the URL directly for a `<link>` tag; `GET /themes/active` (JSON) is what components actually fetch and apply via `applyThemeCss` |

## Wired this round

- **`POST /assignments/:id/sync-attempts`** had no frontend wrapper at all, not
  a merely-unused one — it never appeared in `assignments.api.ts`. Added as
  `syncAssignmentAttempts` and wired into `AssignmentDetailPage` as a "Sync new
  learners" button, next to "Add learners", gated the same way (`assignment.write`).

## Wrappers corrected in this round

These existed but sent the wrong body or read the wrong shape:

- **Question update** ignores nested answers and hints. The editor now syncs
  them through `/questions/:id/options` and `/hints`.
- **Terms** are `startsAt` / `endsAt` on the server, not `startsOn` / `endsOn`.
- **Incident routes** return `{ incident, overdue, closure, … }`. The API layer
  now flattens that into one row.
- **Platform overview, settings catalogue, release notes and support policies**
  are now typed to match what the server actually sends.
- **The learner dashboard's `nextAction`** was typed with a `path: string`
  field the server has never sent — `LearnerAction` only carries `kind`,
  `label`, `reason`, `targetId`, `targetType`. The home page's loudest button
  (`<ButtonLink to={nextAction.path}>`) was linking to `undefined` for every
  learner, on every visit. Fixed by typing the field correctly and adding
  `dashboard/next-action-path.ts`, which maps `kind` to a real route.
  Incidentally, this is why `/learn/screening` read as unreachable below — the
  `FINISH_SCREENING` kind now sends the learner there.
- **`TenantStatus`** (`auth.types.ts`, `tenancy.types.ts`) had `'PENDING'`,
  which the server's enum has never had, and was missing `'PROSPECT'` and
  `'TRIAL'`, which it has always had. Because the type itself was wrong,
  `Record<TenantStatus, BadgeTone>` maps in `SchoolsPage`, `OrganizationsPage`,
  `SchoolDetailPage` and `OrganizationDetailPage` type-checked while silently
  missing two real statuses, and the status-change dropdown on the latter two
  offered "PENDING" as an option that always failed server-side validation.
- **`BillingInterval`** was missing `'QUARTERLY'`, which the server has always
  accepted. The agreement create/edit form couldn't offer it.

## Reached, but not from anywhere in the app

Two routed pages had a working `*.routes.tsx` entry and no link to them
anywhere else in the UI — the router-vs-nav check above only compares against
route files, so this needed checking every page against every other page too.

- **`/learn/profile`** (`StudentProfilePage`: badges, points, buddy) had no nav
  tab, no tile, and the shared `UserMenu` avatar dropdown goes to
  `/account/preferences` for every role, students included. Added as a tile on
  `StudentHomePage`.
- **`/learn/screening`** was reachable only through the dashboard's `nextAction`
  link, which was broken (see above) — fixed by the same change.

## Blocked outside the frontend

See `docs/PROGRESS.md` → "Not done, and why".
