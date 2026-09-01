// ─────────────────────────────────────────────────────────────────────────────
// Mission validation
// Blueprint 03: a mission gives short-term purpose — "practise subtraction three
// times this week" — and is "always framed as achievable, never as a penalty for
// falling behind".
//
// Two shaping decisions live in this file:
//
//   • `goalType` is a fixed list, not free text. The schema stores it as a
//     `VarChar(40)` because a mission's countable things are a product decision
//     rather than a database one, but accepting anything would let a school
//     create a mission nothing can ever measure. The enum below is exactly the
//     set `missions.rules.ts` knows how to count, so a mission that validates is
//     a mission that can complete.
//   • There is no "penalty" or "deadline missed" field to validate, because the
//     blueprint does not allow one. A mission that runs out simply expires, and
//     an expired mission costs the learner nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { AgeMode, MissionStatus } from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import {
  boolQuery,
  idSchema,
  keySchema,
  optionalDate,
  optionalText,
  text,
} from '../../core/http/validate';

/**
 * What a mission counts. Each value maps to exactly one measurement in
 * `missions.rules.ts`; adding a value here without adding the measurement there
 * would create a mission that can never be finished.
 */
export const GOAL_TYPES = [
  'ACTIVITIES_COMPLETED',
  'MINUTES_LEARNED',
  'TOPICS_MASTERED',
  'ASSIGNMENTS_ON_TIME',
  'ACCURACY_PERCENT',
  'STREAK_DAYS',
] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export const goalTypeSchema = z.enum(GOAL_TYPES);

/**
 * Upper bounds are generous but finite. `ACCURACY_PERCENT` is capped at 100
 * separately in the refinement below, because a mission asking for 400% accuracy
 * is unachievable by construction and the blueprint forbids that.
 */
const goalTargetSchema = z.coerce.number().int().min(1).max(100_000);

export const missionListQuery = listQuerySchema.extend({
  classId: idSchema.optional(),
  topicId: idSchema.optional(),
  goalType: goalTypeSchema.optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  activeOnly: boolQuery(true),
  includeArchived: boolQuery(false),
  recurringOnly: boolQuery(false),
  /** Attaches the calling learner's progress row to each mission. */
  withMine: boolQuery(false),
});

const missionShape = {
  title: text(180, 2),
  description: text(600, 4),
  classId: idSchema.optional(),
  topicId: idSchema.optional(),
  ageMode: z.nativeEnum(AgeMode).optional(),
  goalType: goalTypeSchema,
  goalTarget: goalTargetSchema,
  pointsReward: z.coerce.number().int().min(0).max(10_000).default(0),
  rewardBadgeId: idSchema.optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
  isRecurring: z.boolean().default(false),
  /** A week is the blueprint's own example, so it is the default cadence. */
  recurrenceDays: z.coerce.number().int().min(1).max(90).optional(),
  autoEnrol: z.boolean().default(true),
};

/** Rules that apply to any mission, whether being created or edited. */
function checkMission(
  value: {
    goalType?: GoalType;
    goalTarget?: number;
    isRecurring?: boolean;
    recurrenceDays?: number;
    startsAt?: Date;
    endsAt?: Date;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    value.goalType === 'ACCURACY_PERCENT' &&
    value.goalTarget !== undefined &&
    value.goalTarget > 100
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['goalTarget'],
      message: 'An accuracy goal is a percentage, so it cannot ask for more than 100.',
    });
  }
  if (value.isRecurring === true && value.recurrenceDays === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recurrenceDays'],
      message: 'A repeating mission needs to know how long each round lasts.',
    });
  }
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'A mission has to end after it starts.',
    });
  }
}

export const createMissionSchema = z
  .object({ ...missionShape, key: keySchema })
  .strict()
  .superRefine(checkMission);

/**
 * `key` is absent deliberately: it is how other records and the seed refer to a
 * mission, so renaming it would break those references silently.
 */
export const updateMissionSchema = z
  .object(missionShape)
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Send at least one field to change.',
      });
    }
    checkMission(value, ctx);
  });

/**
 * Enrolling learners by hand. `autoEnrol` covers the common case, so this exists
 * for the mission a teacher wants to give to a named few — a nudge for three
 * children, not a class-wide announcement.
 */
export const enrolMissionSchema = z
  .object({
    studentIds: z.array(idSchema).min(1).max(200),
  })
  .strict();

/**
 * Withdrawing a mission from a learner. A reason is required because blueprint 04
 * asks for teacher decisions to be attributable, and cancelling something a child
 * was working towards is a decision worth explaining.
 */
export const cancelMissionSchema = z
  .object({
    studentIds: z.array(idSchema).min(1).max(200),
    reason: text(400, 4),
  })
  .strict();

export const missionProgressListQuery = listQuerySchema.extend({
  missionId: idSchema.optional(),
  studentId: idSchema.optional(),
  classId: idSchema.optional(),
  status: z.nativeEnum(MissionStatus).optional(),
  /** Finished but not yet shown to the learner, for the "well done" moment. */
  unseenOnly: boolQuery(false),
  /** Only the current round of a repeating mission. */
  currentPeriodOnly: boolQuery(false),
});

/** The learner's own board, or a named learner's when staff are looking. */
export const myMissionsQuery = z.object({
  studentId: idSchema.optional(),
  includeCompleted: boolQuery(true),
});

/**
 * A read about one learner and nothing else — the dashboard card. Separate from
 * `myMissionsQuery` so a summary endpoint does not advertise options it ignores.
 */
export const studentScopeQuery = z.object({
  studentId: idSchema.optional(),
});

/** Acknowledging finished missions, optionally on a named learner's behalf. */
export const markSeenSchema = z
  .object({
    studentId: idSchema.optional(),
  })
  .strict();

/**
 * Recomputing on demand. The nightly roll keeps progress fresh, but a learner
 * who has just finished an activity should see the bar move now rather than in an
 * hour, so the client may ask for a refresh.
 */
export const refreshProgressSchema = z
  .object({
    studentId: idSchema.optional(),
    missionId: idSchema.optional(),
    note: optionalText(200),
  })
  .strict();

export type MissionListQuery = z.infer<typeof missionListQuery>;
export type CreateMissionInput = z.infer<typeof createMissionSchema>;
export type UpdateMissionInput = z.infer<typeof updateMissionSchema>;
export type EnrolMissionInput = z.infer<typeof enrolMissionSchema>;
export type CancelMissionInput = z.infer<typeof cancelMissionSchema>;
export type MissionProgressListQuery = z.infer<typeof missionProgressListQuery>;
export type MyMissionsQuery = z.infer<typeof myMissionsQuery>;
export type StudentScopeQuery = z.infer<typeof studentScopeQuery>;
export type MarkSeenInput = z.infer<typeof markSeenSchema>;
export type RefreshProgressInput = z.infer<typeof refreshProgressSchema>;
