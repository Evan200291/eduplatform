import type { ListQuery } from '@/api/types';
import type { ContentStatus, DifficultyBand } from '@/content/content.types';

/** Mirrors `backend/src/modules/curriculum` — the tree students and staff both browse. */

export interface CurriculumProgram {
  id: string;
  subjectId: string;
  name: string;
  key: string;
  description: string | null;
  status: ContentStatus;
}

export interface CurriculumUnit {
  id: string;
  programId: string;
  name: string;
  key: string;
  sortOrder: number;
  status: ContentStatus;
}

export interface CurriculumTopic {
  id: string;
  subjectId: string;
  unitId: string;
  name: string;
  key: string;
  difficultyBand: DifficultyBand;
  estimatedMinutes: number | null;
  masteryThreshold: number;
  prerequisites: string[];
  status: ContentStatus;
}

export interface LearningObjective {
  id: string;
  topicId: string;
  code: string;
  statement: string;
  status: ContentStatus;
}

export interface CurriculumListQuery extends ListQuery {
  subjectId?: string;
  unitId?: string;
  programId?: string;
  status?: ContentStatus;
  includeArchived?: boolean;
}
