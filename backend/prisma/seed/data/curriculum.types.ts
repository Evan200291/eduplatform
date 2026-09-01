// ─────────────────────────────────────────────────────────────────────────────
// Curriculum data — shared shapes
// Blueprint 02 "Curriculum engine": Program → Unit → Topic → Objective.
//
// The demo curriculum is plain data so that another editor (human or AI) can add
// a subject by copying one file and never touching the writer in
// prisma/seed/curriculum.seed.ts. Ordering inside each array is meaningful: it
// becomes `sortOrder`, and the prerequisite chain is derived from it.
// ─────────────────────────────────────────────────────────────────────────────

import type { DifficultyBand } from '@prisma/client';

/** `[code, statement]` — kept as a tuple to keep the data tables readable. */
export type ObjectiveSpec = readonly [code: string, statement: string];

export interface TopicSpec {
  key: string;
  name: string;
  description: string;
  /** Expected time on task for one pass through the topic. */
  minutes: number;
  band: DifficultyBand;
  objectives: readonly ObjectiveSpec[];
}

export interface UnitSpec {
  key: string;
  name: string;
  description: string;
  topics: readonly TopicSpec[];
}

export interface ProgramSpec {
  /** Matches a `Subject.key` seeded by school.seed.ts. */
  subjectKey: string;
  /** Matches a `Grade.key` seeded by school.seed.ts. */
  gradeKey: string;
  key: string;
  name: string;
  framework: string;
  description: string;
  units: readonly UnitSpec[];
}
