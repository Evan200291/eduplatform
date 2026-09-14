# Backend routes with no frontend caller

**Updated 14 September 2026.** This replaces the 1 September list, which is now
out of date. Support tickets, the platform operations console, the moderation
queue, content authoring and report export downloads all have screens now.

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

## Wrappers corrected in this round

These existed but sent the wrong body or read the wrong shape:

- **Question update** ignores nested answers and hints. The editor now syncs
  them through `/questions/:id/options` and `/hints`.
- **Terms** are `startsAt` / `endsAt` on the server, not `startsOn` / `endsOn`.
- **Incident routes** return `{ incident, overdue, closure, … }`. The API layer
  now flattens that into one row.
- **Platform overview, settings catalogue, release notes and support policies**
  are now typed to match what the server actually sends.

## Blocked outside the frontend

See `docs/PROGRESS.md` → "Not done, and why".
