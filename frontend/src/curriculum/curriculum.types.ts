import type { ListQuery } from '@/api/types';
import type { ContentStatus, DifficultyBand } from '@/content/content.types';

/** Mirrors `backend/src/modules/curriculum` — the tree students and staff both browse. */

export interface CurriculumProgram {
  id: string;
  subjectId: string;
  name: string;
  key: string;
  description: string | null;
  sortOrder: number;
  status: ContentStatus;
}

export interface CurriculumUnit {
  id: string;
  programId: string;
  name: string;
  key: string;
  description: string | null;
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
  description: string | null;
  sortOrder: number;
  status: ContentStatus;
  _count?: { objectives: number; lessons: number; activities: number; assessments: number };
}

/** `GET /curriculum/topics/:id` — the list omits prerequisites and objectives. */
export interface CurriculumTopicDetail extends CurriculumTopic {
  objectives: LearningObjective[];
  prerequisites: {
    id: string;
    isHard: boolean;
    requiredTopic: { id: string; name: string; key: string; difficultyBand: DifficultyBand };
  }[];
  requiredFor: { id: string; isHard: boolean; topic: { id: string; name: string; key: string } }[];
}

export interface LearningObjective {
  id: string;
  topicId: string;
  code: string;
  statement: string;
  notes: string | null;
  difficultyBand: DifficultyBand;
  sortOrder: number;
}

export interface CurriculumListQuery extends ListQuery {
  subjectId?: string;
  unitId?: string;
  programId?: string;
  topicId?: string;
  status?: ContentStatus;
  includeArchived?: boolean;
}
