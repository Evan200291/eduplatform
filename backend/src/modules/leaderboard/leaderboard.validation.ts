// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard validation
// Blueprint 03 is unusually explicit about leaderboards, and every clause of it
// shows up here as a constraint rather than as a comment:
//
//   • Off by default. `isActive` is absent from the create schema, so a board comes
//     into existence switched off and somebody has to make the decision to turn it
//     on. There is no way to create a live board in one call.
//   • Identity is configurable. `identityMode` is required on create — real name,
//     nickname, avatar only, or anonymous rank — because leaving it to a default is
//     how a child's real name ends up on a wall nobody meant to publish.
//   • Ranking need not be competitive. `PERSONAL_BEST` and `COOPERATIVE_TEAM` are
//     first-class options, not afterthoughts, and personal best is the schema's
//     default.
//   • Small boards are hidden. `minParticipants` cannot be set below two, because a
//     "leaderboard" of one is a public notice about one child.
// ─────────────────────────────────────────────────────────────────────────────

import {
  LeaderboardIdentityMode,
  LeaderboardRankingMode,
  LeaderboardScope,
} from '@prisma/client';
import { z } from 'zod';
import { listQuerySchema } from '../../core/http/pagination';
import { boolQuery, idSchema, intQuery, optionalDate, text } from '../../core/http/validate';

/**
 * A board's rolling window, in days. Null is all-time, which is a real choice for a
 * termly event board, so it is expressible rather than approximated by a huge number.
 */
const periodDaysSchema = z.coerce.number().int().min(1).max(365);

const configShape = {
  name: text(140, 3),
  scope: z.nativeEnum(LeaderboardScope),
  /** The class, grade, subject or group the board covers. Null for a whole school. */
  scopeId: idSchema.nullable().optional(),
  identityMode: z.nativeEnum(LeaderboardIdentityMode),
  rankingMode: z.nativeEnum(LeaderboardRankingMode),
  periodDays: periodDaysSchema.nullable().optional(),
  /**
   * Below this many participants the board shows nobody. Two is the floor: a board
   * that can display a single learner is a public notice about that learner.
   */
  minParticipants: z.coerce.number().int().min(2).max(500).optional(),
  showTopN: z.coerce.number().int().min(1).max(100).optional(),
  allowOptOut: z.boolean().optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
};

function checkConfig(
  value: {
    scope?: LeaderboardScope;
    scopeId?: string | null;
    startsAt?: Date;
    endsAt?: Date;
    allowOptOut?: boolean;
  },
  ctx: z.RefinementCtx,
): void {
  // A class board with no class is a board with no cohort, and it would silently
  // rank the entire school under a name that promised otherwise.
  const needsScopeId =
    value.scope === LeaderboardScope.CLASS ||
    value.scope === LeaderboardScope.GRADE ||
    value.scope === LeaderboardScope.SUBJECT ||
    value.scope === LeaderboardScope.COHORT;

  if (needsScopeId && value.scope !== undefined && !value.scopeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeId'],
      message: `A ${value.scope.toLowerCase()} board needs the id of the ${value.scope.toLowerCase()} it covers.`,
    });
  }

  if (value.startsAt && value.endsAt && value.endsAt.getTime() <= value.startsAt.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'A board has to finish after it starts.',
    });
  }

  // Blueprint 03: "a learner can always opt out of appearing." A school can leave
  // the flag alone, but it cannot be turned off.
  if (value.allowOptOut === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['allowOptOut'],
      message: 'A learner can always opt out of appearing on a leaderboard.',
    });
  }
}

/** Creating. `isActive` is deliberately absent: a new board starts switched off. */
export const createLeaderboardSchema = z.object(configShape).strict().superRefine(checkConfig);

/**
 * Editing, including the switch that publishes it. Changing the ranking mode or the
 * window invalidates the standings, which the service handles by recomputing rather
 * than by leaving stale figures under a new heading.
 */
export const updateLeaderboardSchema = z
  .object(configShape)
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict()
  .superRefine(checkConfig);

export const leaderboardListQuery = listQuerySchema.extend({
  scope: z.nativeEnum(LeaderboardScope).optional(),
  scopeId: idSchema.optional(),
  activeOnly: boolQuery(false),
  includeArchived: boolQuery(false),
});

/**
 * Reading a board. `studentId` is a staff convenience for "show me this learner's
 * position", and is resolved through the scope service like every other one.
 */
export const boardQuery = z.object({
  studentId: idSchema.optional(),
  /** Beyond the published top N, for a staff view that needs the whole standing. */
  limit: intQuery(1, 200, 25),
});

/** Blueprint 03's opt-out. A learner's own decision; staff cannot make it for them. */
export const optOutSchema = z
  .object({
    hidden: z.boolean(),
  })
  .strict();

export type CreateLeaderboardInput = z.infer<typeof createLeaderboardSchema>;
export type UpdateLeaderboardInput = z.infer<typeof updateLeaderboardSchema>;
export type LeaderboardListQuery = z.infer<typeof leaderboardListQuery>;
export type BoardQuery = z.infer<typeof boardQuery>;
export type OptOutInput = z.infer<typeof optOutSchema>;
