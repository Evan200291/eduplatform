// ─────────────────────────────────────────────────────────────────────────────
// Curriculum data — the whole demo curriculum in one list
// Add a subject by writing one file next to the three below and adding it here.
// Nothing else in the seed needs to change.
// ─────────────────────────────────────────────────────────────────────────────

import { ENGLISH_PROGRAMS } from './curriculum.english';
import { MATHEMATICS_PROGRAMS } from './curriculum.mathematics';
import { SCIENCE_PROGRAMS } from './curriculum.science';
import type { ProgramSpec } from './curriculum.types';

export const CURRICULUM: readonly ProgramSpec[] = [
  ...MATHEMATICS_PROGRAMS,
  ...ENGLISH_PROGRAMS,
  ...SCIENCE_PROGRAMS,
];

export type { ObjectiveSpec, ProgramSpec, TopicSpec, UnitSpec } from './curriculum.types';
