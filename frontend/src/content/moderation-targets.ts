import type { ContentReportReason, ModerationDecision } from './content.types';

/**
 * PRD v2.5 response targets for reported content: urgent safeguarding
 * concerns are reviewed immediately, everything else within one business day.
 *
 * The server does not yet hold a deadline or escalate an overdue report, so the
 * queue works the target out here from when the report was raised. This is a
 * display aid for the reviewer, not the escalation itself.
 *
 * Which reasons count as urgent is an assumption until the PM confirms it (see
 * PM-QUESTIONS.txt): a report that content is inappropriate or not suitable for
 * the learner's age is treated as a possible safeguarding matter.
 */
export const URGENT_REASONS: ReadonlySet<ContentReportReason> = new Set([
  'INAPPROPRIATE_CONTENT',
  'AGE_UNSUITABLE',
]);

/** Working hours start. A report raised at the weekend is counted from Monday at this hour. */
const WORKDAY_START_HOUR = 9;
const DUE_SOON_MS = 4 * 60 * 60 * 1000;

export type ModerationTargetState = 'urgent' | 'overdue' | 'due-soon' | 'on-track' | 'met' | 'missed';

export interface ModerationTarget {
  state: ModerationTargetState;
  isUrgent: boolean;
  /** Null for urgent reports, whose target is "now". */
  dueAt: Date | null;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** One business day after `raisedAt`, skipping Saturdays and Sundays. Bank holidays are not known. */
export function oneBusinessDayAfter(raisedAt: Date): Date {
  const start = new Date(raisedAt);
  if (isWeekend(start)) {
    while (isWeekend(start)) start.setDate(start.getDate() + 1);
    start.setHours(WORKDAY_START_HOUR, 0, 0, 0);
  }
  const due = new Date(start);
  do {
    due.setDate(due.getDate() + 1);
  } while (isWeekend(due));
  return due;
}

export function moderationTarget(
  report: { reason: ContentReportReason; decision: ModerationDecision; createdAt: string; resolvedAt: string | null },
  now: Date = new Date(),
): ModerationTarget {
  const isUrgent = URGENT_REASONS.has(report.reason);
  const raisedAt = new Date(report.createdAt);
  const dueAt = isUrgent ? null : oneBusinessDayAfter(raisedAt);

  if (report.decision !== 'PENDING') {
    // An urgent report has no fixed clock; treat a same-day answer as meeting it.
    const resolvedAt = report.resolvedAt ? new Date(report.resolvedAt) : null;
    const deadline = dueAt ?? new Date(raisedAt.getTime() + 24 * 60 * 60 * 1000);
    return { state: resolvedAt && resolvedAt > deadline ? 'missed' : 'met', isUrgent, dueAt };
  }

  if (isUrgent) return { state: 'urgent', isUrgent, dueAt };
  if (dueAt && now > dueAt) return { state: 'overdue', isUrgent, dueAt };
  if (dueAt && dueAt.getTime() - now.getTime() <= DUE_SOON_MS) return { state: 'due-soon', isUrgent, dueAt };
  return { state: 'on-track', isUrgent, dueAt };
}
