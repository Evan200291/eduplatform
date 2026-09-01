// ─────────────────────────────────────────────────────────────────────────────
// Companion validation
// Blueprint 03: "The companion grows through learning." Stages only move forward,
// there is no death, and decay — where a school opts into it at all — touches mood
// and nothing else.
//
// That rule shows up in this file as an absence. There is no "feed" action, no
// hunger value and no health field to validate, because a companion that can be
// neglected into suffering is a companion that punishes a child for being away
// from school. What a learner can do is greet it, play with it, and change how it
// looks; the growing is done by the learning.
// ─────────────────────────────────────────────────────────────────────────────

import { CompanionMood, CompanionStage } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import { boolQuery, idSchema, jsonValue, text } from '../../core/http/validate';

/**
 * The creature families a learner may choose. A fixed list rather than free text,
 * because the frontend needs artwork for whatever is stored and a typo would leave
 * a child with an invisible companion.
 */
export const SPECIES_KEYS = [
  'ember-fox',
  'river-otter',
  'meadow-hare',
  'star-owl',
  'cloud-turtle',
  'pebble-badger',
] as const;

export type SpeciesKey = (typeof SPECIES_KEYS)[number];

/**
 * What a learner can do with their companion. Each is a kindness; none is a chore.
 * `PRAISE` exists because telling something you are proud of it is the interaction
 * children reach for first, and blueprint 03 wants recognition to flow both ways.
 */
export const INTERACTION_KINDS = ['GREET', 'PLAY', 'PRAISE'] as const;

export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/** Event kinds the schema's own comment names, in the order they were listed. */
export const EVENT_KINDS = [
  'GROWTH',
  'STAGE_CHANGE',
  'MOOD_CHANGE',
  'ACCESSORY_UNLOCK',
  'INTERACTION',
  'MILESTONE',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * A companion's name. Two characters minimum so it is a name rather than a stray
 * keypress, and the same 60-character ceiling the column has.
 */
const companionName = text(60, 2);

/** Creating or adopting. A learner picks a species and names it; nothing else. */
export const createCompanionSchema = z
  .object({
    /** Staff setting a companion up alongside a learner. */
    studentId: idSchema.optional(),
    speciesKey: z.enum(SPECIES_KEYS),
    name: companionName,
  })
  .strict();

/**
 * Renaming and redressing. Species is absent deliberately: swapping the creature
 * would make the growth history read as somebody else's, and the history is the
 * point — "you earned this by finishing three lessons".
 */
export const updateCompanionSchema = z
  .object({
    studentId: idSchema.optional(),
    name: companionName.optional(),
    appearance: jsonValue.optional(),
    accessories: jsonValue.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const { studentId: _studentId, ...changes } = value;
    if (Object.keys(changes).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Send a name, an appearance or accessories to change.',
      });
    }
  });

export const interactSchema = z
  .object({
    studentId: idSchema.optional(),
    kind: z.enum(INTERACTION_KINDS).default('GREET'),
  })
  .strict();

export const companionQuery = z.object({
  studentId: idSchema.optional(),
});

export const companionEventListQuery = listQuerySchema.extend({
  studentId: idSchema.optional(),
  kind: z.enum(EVENT_KINDS).optional(),
  /** Milestones the learner has not been shown yet, for the celebration queue. */
  unseenOnly: boolQuery(false),
});

/**
 * A teacher or admin looking across learners: who has a companion, who has not
 * opened it lately. Read-only and deliberately thin — a companion is the child's,
 * and staff need enough to notice disengagement, not a management console.
 */
export const companionListQuery = listQuerySchema.extend({
  classId: idSchema.optional(),
  stage: z.nativeEnum(CompanionStage).optional(),
  mood: z.nativeEnum(CompanionMood).optional(),
  /** No interaction for a week or more. A prompt for a conversation, not a report. */
  quietOnly: boolQuery(false),
});

/**
 * Staff granting growth by hand — for the learning that happened off-screen. A note
 * is required for the same reason a manual points adjustment requires one: an
 * unexplained jump in a child's record is worse than no jump at all.
 */
export const grantGrowthSchema = z
  .object({
    studentIds: z.array(idSchema).min(1).max(200),
    growthPoints: z.coerce.number().int().min(1).max(1_000),
    note: text(400, 4),
  })
  .strict();

/**
 * The stage ladder itself: one entry per `CompanionStage`, ascending, starting at
 * zero. Sent and returned as the full six-entry list rather than a partial patch,
 * because a gap or an out-of-order stage would produce a companion that cannot
 * reach one of its own stages.
 */
export const STAGE_ORDER = [
  'EGG',
  'HATCHLING',
  'JUVENILE',
  'ADOLESCENT',
  'ADULT',
  'RADIANT',
] as const;

export const growthConfigSchema = z
  .object({
    thresholds: z
      .array(
        z.object({
          stage: z.enum(STAGE_ORDER),
          growthPoints: z.number().int().min(0).max(1_000_000),
        }),
      )
      .length(STAGE_ORDER.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    STAGE_ORDER.forEach((stage, index) => {
      if (value.thresholds[index]?.stage !== stage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['thresholds', index, 'stage'],
          message: `Expected stage "${stage}" at position ${index}.`,
        });
      }
    });
    for (let index = 1; index < value.thresholds.length; index += 1) {
      if (value.thresholds[index].growthPoints <= value.thresholds[index - 1].growthPoints) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['thresholds', index, 'growthPoints'],
          message: 'Each stage must require more growth than the one before it.',
        });
      }
    }
    if (value.thresholds[0]?.growthPoints !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thresholds', 0, 'growthPoints'],
        message: 'EGG must start at 0 growth.',
      });
    }
  });

export type GrowthConfigInput = z.infer<typeof growthConfigSchema>;

export type CreateCompanionInput = z.infer<typeof createCompanionSchema>;
export type UpdateCompanionInput = z.infer<typeof updateCompanionSchema>;
export type InteractInput = z.infer<typeof interactSchema>;
export type CompanionQuery = z.infer<typeof companionQuery>;
export type CompanionEventListQuery = z.infer<typeof companionEventListQuery>;
export type CompanionListQuery = z.infer<typeof companionListQuery>;
export type GrantGrowthInput = z.infer<typeof grantGrowthSchema>;
