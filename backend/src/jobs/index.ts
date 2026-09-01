// ─────────────────────────────────────────────────────────────────────────────
// Scheduled work
// Blueprint 13: routine operations must run on a schedule and be observable.
// Every run writes a `JobRun` row, so an operator can answer "did the digest go
// out last night?" without reading logs.
//
// These run in-process on `setInterval` rather than under an external scheduler,
// because this project deploys as a single PM2 process. Running more than one
// API instance means moving these to a dedicated worker (see docs/DEPLOYMENT.md).
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../core/logger';
import { prisma } from '../core/prisma';
import { pruneExpiredSessions } from '../core/auth/session.service';
import { recomputeAllLeaderboards } from '../modules/leaderboard/leaderboard.service';
import { expireOverdueAssignments } from '../modules/assignments/assignments.jobs';
import { rollMissionPeriods } from '../modules/missions/missions.service';
import { runStreakMaintenance } from '../modules/gamification/streaks.service';
import { dispatchDueNotifications } from '../modules/notifications/notifications.service';
import { applyRetentionPolicies } from '../modules/privacy/retention.service';
import { expireStaleExports } from '../modules/reporting/exports.service';
import { autoApproveDueRecommendations } from '../modules/learning/recommendations.service';

const log = logger.child({ module: 'jobs' });

interface JobSpec {
  key: string;
  intervalMs: number;
  /** Delay before the first run so startup is not a thundering herd. */
  initialDelayMs: number;
  run: () => Promise<number>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const JOBS: JobSpec[] = [
  {
    key: 'notifications.dispatch',
    intervalMs: 2 * MINUTE,
    initialDelayMs: 20_000,
    run: dispatchDueNotifications,
  },
  {
    key: 'assignments.overdue',
    intervalMs: 15 * MINUTE,
    initialDelayMs: 45_000,
    run: expireOverdueAssignments,
  },
  {
    key: 'recommendations.autoApprove',
    intervalMs: 15 * MINUTE,
    initialDelayMs: 60_000,
    run: autoApproveDueRecommendations,
  },
  {
    key: 'missions.rollPeriods',
    intervalMs: HOUR,
    initialDelayMs: 90_000,
    run: rollMissionPeriods,
  },
  {
    key: 'gamification.streaks',
    intervalMs: HOUR,
    initialDelayMs: 2 * MINUTE,
    run: runStreakMaintenance,
  },
  {
    key: 'leaderboard.recompute',
    intervalMs: HOUR,
    initialDelayMs: 3 * MINUTE,
    run: recomputeAllLeaderboards,
  },
  {
    key: 'reporting.expireExports',
    intervalMs: 6 * HOUR,
    initialDelayMs: 5 * MINUTE,
    run: expireStaleExports,
  },
  {
    key: 'sessions.prune',
    intervalMs: 12 * HOUR,
    initialDelayMs: 6 * MINUTE,
    run: () => pruneExpiredSessions(),
  },
  {
    key: 'retention.purge',
    intervalMs: 24 * HOUR,
    initialDelayMs: 10 * MINUTE,
    run: applyRetentionPolicies,
  },
];

const timers: NodeJS.Timeout[] = [];
/** Guards against a slow run overlapping its own next tick. */
const running = new Set<string>();

async function execute(spec: JobSpec): Promise<void> {
  if (running.has(spec.key)) {
    log.warn({ jobKey: spec.key }, 'skipping run; previous run still in progress');
    return;
  }
  running.add(spec.key);

  const startedAt = new Date();
  let jobRunId: string | null = null;

  try {
    const jobRun = await prisma.jobRun.create({
      data: { jobKey: spec.key, status: 'RUNNING', startedAt },
      select: { id: true },
    });
    jobRunId = jobRun.id;

    const itemsProcessed = await spec.run();
    const finishedAt = new Date();

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        itemsProcessed,
      },
    });

    if (itemsProcessed > 0) log.info({ jobKey: spec.key, itemsProcessed }, 'job completed');
  } catch (error) {
    log.error({ err: error, jobKey: spec.key }, 'job failed');
    if (jobRunId) {
      const finishedAt = new Date();
      await prisma.jobRun
        .update({
          where: { id: jobRunId },
          data: {
            status: 'FAILED',
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            failureReason: error instanceof Error ? error.message : String(error),
          },
        })
        .catch(() => undefined);
    }
  } finally {
    running.delete(spec.key);
  }
}

export function startScheduledJobs(): void {
  for (const spec of JOBS) {
    const kickoff = setTimeout(() => {
      void execute(spec);
      const interval = setInterval(() => void execute(spec), spec.intervalMs);
      // Never hold the event loop open purely for a timer.
      interval.unref();
      timers.push(interval);
    }, spec.initialDelayMs);
    kickoff.unref();
    timers.push(kickoff);
  }
  log.info({ count: JOBS.length }, 'scheduled jobs started');
}

export function stopScheduledJobs(): void {
  for (const timer of timers) clearTimeout(timer);
  timers.length = 0;
}

/** Runs one job on demand. Used by the platform admin "run now" control. */
export async function runJobNow(jobKey: string): Promise<boolean> {
  const spec = JOBS.find((entry) => entry.key === jobKey);
  if (!spec) return false;
  await execute(spec);
  return true;
}

export const JOB_KEYS: readonly string[] = JOBS.map((spec) => spec.key);
