# "Sunny" — the young-learner design

For Kindergarten to Grade 2 (`EARLY_YEARS`) and up to Grade 5 (`PRIMARY`). The look borrows what works in
Duolingo-style apps: raised buttons that sink when pressed, a chunky progress bar, a zig-zag lesson path,
a friendly mascot, read-aloud, and encouragement instead of red "wrong" screens.

## See it

| What | Where |
|---|---|
| Clickable prototype of **every page** (55 entries, 148 states, with state / age / device toggles) | `docs/design/kids/index.html` — `python -m http.server 5180 --directory docs/design/kids`, then open http://localhost:5180 |
| Living style guide made of the **real components** (dev only, no sign-in) | `npm run dev` in `frontend/`, then http://localhost:5173/dev/kids |

The prototype covers learner, teacher, admin, sign-in and system pages. Learner pages use the full
early-years design. Teacher and admin pages use the same playful language at adult density (they are
prototype-only — the code below only switches on for young learners).

## How it switches on

`applyAgeMode()` (`src/theme/age-mode.ts`) already scales the server-compiled `--midas-*` tokens per age mode.
It now also sets `data-kid` on `<html>` for `EARLY_YEARS` and `PRIMARY`, and removes it otherwise.
`src/styles/kids.css` only matches `:root[data-kid]`, so teachers, admins and older learners are untouched.
Colours still come from the school theme tokens, so a rebrand carries through.

## Building blocks

| Piece | File | Notes |
|---|---|---|
| Raised button edge | `components/ui/button-styles.ts` | `--edge-h` var: 4px default, 6px kid, 7px early years |
| Hook classes | `kid-btn`, `kid-card`, `kid-tile`, `kid-tile-chip`, `kid-bar-track`, `kid-bar-fill`, `kid-tab`, `kid-tab-icon`, `kid-option` | Already on `Button`, `Card`, `ProgressBar`, `Tile`, `LearnerShell`, `QuestionCard`. Inert without `data-kid`. |
| Pip, the buddy | `components/kids/Buddy.tsx` | SVG, moods `happy cheer think sleepy oops`, tinted by the primary token, `aria-hidden` |
| Read aloud | `components/kids/ReadAloudButton.tsx`, `lib/read-aloud.ts` | Web Speech API; renders nothing when the browser has no speech |
| Lesson path | `components/kids/LessonPath.tsx` | Nodes `done / now / open / locked`; used by `ActivitiesPage` for young learners |
| Confetti | `components/kids/Confetti.tsx` | CSS only; hidden under `prefers-reduced-motion` |

## Rules of the design

- **Never red for a wrong answer** to a young learner — gentle "try again" with the `oops` Pip.
- **Big targets:** answer options are at least 4rem high; controls are never smaller than the touch minimum.
- **Read-aloud** on every prompt a child must read.
- **Motion is decoration** — everything animated stops under reduced motion.
- **Text always carries the meaning**; Pip and icons are extra.

## Adding it to a new screen

1. Use `Button`, `Card`, `ProgressBar` from `@/components/ui` — they already carry the kid hooks.
2. For a young-learner-only flourish, branch on `isYoungLearner(useAgeMode())` and drop in `Buddy`,
   `ReadAloudButton` or `LessonPath`.
3. Add a case to `src/dev/KidsGallery.tsx` so the look can be checked without an API.
