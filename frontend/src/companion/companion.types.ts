export type SpeciesKey =
  | 'ember-fox'
  | 'river-otter'
  | 'meadow-hare'
  | 'star-owl'
  | 'cloud-turtle'
  | 'pebble-badger';
export type CompanionStage = string;
export type CompanionMood = string;
export type CompanionEventKind = 'GROWTH' | 'STAGE_CHANGE' | 'MOOD_CHANGE' | 'ACCESSORY_UNLOCK' | 'INTERACTION' | 'MILESTONE';

export interface CompanionState {
  id: string;
  schoolId: string;
  studentId: string;
  speciesKey: SpeciesKey;
  name: string;
  appearance: unknown;
  accessories: unknown;
  stage: CompanionStage;
  mood: CompanionMood;
  growthPoints: number;
  level: number;
  careStreak: number;
  lastInteractionAt: string | null;
  stageLabel: string;
  nextStage: { stage: CompanionStage; growthPoints: number } | null;
  stagePercent: number;
}

export type CompanionResult =
  | { studentId: string; companion: null; speciesAvailable: true }
  | { studentId: string; companion: CompanionState; speciesAvailable: false };

export type CompanionSummary =
  | { studentId: string; enabled: boolean; hasCompanion: false; unseenEvents: number }
  | {
      studentId: string;
      enabled: boolean;
      hasCompanion: true;
      name: string;
      speciesKey: SpeciesKey;
      stage: CompanionStage;
      stageLabel: string;
      mood: CompanionMood;
      level: number;
      growthPoints: number;
      nextStage: { stage: CompanionStage; growthPoints: number } | null;
      careStreak: number;
      unseenEvents: number;
    };

export interface CompanionEvent {
  id: string;
  companionId: string;
  kind: CompanionEventKind;
  description: string;
  growthDelta: number;
  stageAfter: CompanionStage;
  moodAfter: CompanionMood;
  occurredAt: string;
  seenAt: string | null;
}

/** The six-stage growth ladder (`companion.config`). Ascending, starting at 0. */
export interface GrowthConfig {
  thresholds: { stage: CompanionStage; growthPoints: number }[];
  isCustom: boolean;
}

export interface InteractResult {
  companion: CompanionState;
  growthAwarded: number;
  stageChanged: boolean;
  dailyCapReached: boolean;
}
