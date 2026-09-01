// ─────────────────────────────────────────────────────────────────────────────
// Seed — content reports and moderation reviews
// Blueprint 03 and 05: anyone who meets a problem in the content can flag it, and
// every flag gets an owner, a decision and a written outcome. A fresh install
// therefore ships a queue that already shows all five decisions, because a
// moderation screen that only ever renders "PENDING" has never been tested.
//
// One report per reason in `ContentReportReason`, so the filter chips on the
// moderation screen all have something behind them.
//
// Neither model has a natural unique key. A report is located by its reporter and
// reason — unique inside this fixture by construction — and a review by its report
// and decision. See the note in prisma/seed/helpers.ts on idempotency.
// ─────────────────────────────────────────────────────────────────────────────

import { ContentReportReason, ContentStatus, ModerationDecision } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import type { ContentFixture } from './content.seed';
import type { CurriculumFixture } from './curriculum.seed';
import { daysAgo, log, step } from './helpers';
import type { PeopleFixture } from './people.seed';
import type { SchoolFixture } from './school.seed';

export interface ModerationFixture {
  reportIds: string[];
  /** Reports still waiting on a decision. */
  openReports: number;
  reviews: number;
}

/** A review step recorded against a report. */
interface ReviewStep {
  decision: ModerationDecision;
  notes: string;
  reviewer: 'support' | 'curriculum';
  hoursAfter: number;
  /** Set when platform safety staff took the case on. */
  escalate?: boolean;
}

/** One flag plus the review steps taken on it. */
interface ReportSpec {
  reason: ContentReportReason;
  /** Who noticed. Students report far more than staff do, which the demo shows. */
  reporter: string;
  target: { lessonId?: string; activityId?: string; targetType?: string; targetId?: string };
  details: string;
  decision: ModerationDecision;
  resolutionNotes: string | null;
  daysOld: number;
  reviews: ReviewStep[];
}

/** Local because every timestamp here is "n hours after the flag was raised". */
function hoursAfter(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

async function upsertReport(
  spec: ReportSpec,
  context: { schoolId: string; supportId: string; curriculumId: string; escalateToId: string; now: Date },
): Promise<string> {
  const raisedAt = daysAgo(spec.daysOld, context.now);
  const resolved = spec.decision !== ModerationDecision.PENDING;
  const resolverId = spec.reviews.at(-1)?.reviewer === 'support' ? context.supportId : context.curriculumId;

  const columns = {
    lessonId: spec.target.lessonId ?? null,
    activityId: spec.target.activityId ?? null,
    targetType: spec.target.targetType ?? null,
    targetId: spec.target.targetId ?? null,
    details: spec.details,
    decision: spec.decision,
    resolutionNotes: spec.resolutionNotes,
    resolvedById: resolved ? resolverId : null,
    resolvedAt: resolved ? hoursAfter(raisedAt, 6) : null,
  };

  const existing = await prisma.contentReport.findFirst({
    where: { schoolId: context.schoolId, reporterId: spec.reporter, reason: spec.reason },
    select: { id: true },
  });

  const reportId = existing
    ? (await prisma.contentReport.update({ where: { id: existing.id }, data: columns, select: { id: true } })).id
    : (
        await prisma.contentReport.create({
          data: {
            ...columns,
            schoolId: context.schoolId,
            reporterId: spec.reporter,
            reason: spec.reason,
            createdAt: raisedAt,
          },
          select: { id: true },
        })
      ).id;

  for (const review of spec.reviews) {
    await upsertReview(reportId, spec, review, raisedAt, context);
  }

  return reportId;
}

/**
 * The audit step. `targetType`/`targetId` are copied from the report so a
 * reviewer can search the history of one activity without joining reports.
 */
async function upsertReview(
  reportId: string,
  spec: ReportSpec,
  review: ReviewStep,
  raisedAt: Date,
  context: { supportId: string; curriculumId: string; escalateToId: string },
): Promise<void> {
  const targetType = spec.target.activityId ? 'ACTIVITY' : spec.target.lessonId ? 'LESSON' : (spec.target.targetType ?? 'CONTENT');
  const targetId = spec.target.activityId ?? spec.target.lessonId ?? spec.target.targetId ?? reportId;
  const columns = {
    targetType,
    targetId,
    reviewerId: review.reviewer === 'support' ? context.supportId : context.curriculumId,
    decision: review.decision,
    notes: review.notes,
    escalatedToId: review.escalate ? context.escalateToId : null,
    resolvedAt: review.decision === ModerationDecision.PENDING ? null : hoursAfter(raisedAt, review.hoursAfter),
  };

  const existing = await prisma.contentModerationReview.findFirst({
    where: { reportId, decision: review.decision },
    select: { id: true },
  });

  if (existing) {
    await prisma.contentModerationReview.update({ where: { id: existing.id }, data: columns });
    return;
  }

  await prisma.contentModerationReview.create({
    data: { ...columns, reportId, createdAt: hoursAfter(raisedAt, review.hoursAfter) },
  });
}

/** Content-first review with no report behind it: the pre-publication check. */
async function upsertQueueReview(
  activityId: string,
  reviewerId: string,
  raisedAt: Date,
): Promise<void> {
  const columns = {
    targetType: 'ACTIVITY',
    targetId: activityId,
    reviewerId,
    decision: ModerationDecision.PENDING,
    notes: 'Submitted for publication. Answer key and reading level still to check.',
    escalatedToId: null,
    resolvedAt: null,
  };

  const existing = await prisma.contentModerationReview.findFirst({
    where: { reportId: null, targetType: 'ACTIVITY', targetId: activityId },
    select: { id: true },
  });

  if (existing) {
    await prisma.contentModerationReview.update({ where: { id: existing.id }, data: columns });
    return;
  }

  await prisma.contentModerationReview.create({ data: { ...columns, createdAt: raisedAt } });
}

/**
 * Drops the spec when its reporter or target is missing rather than throwing:
 * the curriculum is data-driven, and a renamed topic key should cost the demo one
 * report, not the whole seed.
 */
function build(
  reporter: string | undefined | null,
  target: ReportSpec['target'] | null,
  rest: Omit<ReportSpec, 'reporter' | 'target'>,
): ReportSpec | null {
  if (!reporter || !target) return null;
  return { ...rest, reporter, target };
}

/** Resolves a demo target by curriculum key so the specs below stay readable. */
function targets(curriculum: CurriculumFixture, content: ContentFixture) {
  const activity = (topicKey: string, key: string): { activityId: string } | null => {
    const topic = curriculum.topicByKey[topicKey];
    const match = topic
      ? content.activities.find((entry) => entry.topicId === topic.id && entry.key === key)
      : undefined;
    return match ? { activityId: match.id } : null;
  };

  const lesson = (topicKey: string): { lessonId: string } | null => {
    const topic = curriculum.topicByKey[topicKey];
    const match = topic ? content.lessonByTopic[topic.id] : undefined;
    return match ? { lessonId: match.id } : null;
  };

  return { activity, lesson };
}

function reportSpecs(
  curriculum: CurriculumFixture,
  content: ContentFixture,
  people: PeopleFixture,
): ReportSpec[] {
  const { activity, lesson } = targets(curriculum, content);
  const student = (classCode: string, nth: number): string | null =>
    people.students.filter((entry) => entry.classCode === classCode)[nth]?.id ?? null;
  const draft = content.activities.find((entry) => entry.status === ContentStatus.DRAFT);

  const specs: (ReportSpec | null)[] = [
    build(people.leadTeacherIds['5C'], activity('science-y5:planets-and-orbits', 'quiz'), {
      reason: ContentReportReason.FACTUAL_ERROR,
      details: 'The explanation still calls Pluto a planet in one sentence. My class spotted it before I did.',
      decision: ModerationDecision.APPROVED,
      resolutionNotes: 'Confirmed and corrected in the next revision. Thank you for the clear report.',
      daysOld: 9,
      reviews: [
        { decision: ModerationDecision.APPROVED, notes: 'Reproduced. Wording fixed and the item re-checked.', reviewer: 'curriculum', hoursAfter: 5 },
      ],
    }),
    build(student('4B', 0), activity('maths-y4:rounding-negative-numbers', 'quiz'), {
      reason: ContentReportReason.WRONG_ANSWER_KEY,
      details: 'I put -7 and it said I was wrong but my teacher says -7 is right.',
      decision: ModerationDecision.APPROVED,
      resolutionNotes: 'The learner was right. The accepted answers now include the negative sign written either way.',
      daysOld: 6,
      reviews: [
        { decision: ModerationDecision.PENDING, notes: 'Triaged. Passing to curriculum to re-check the key.', reviewer: 'support', hoursAfter: 1 },
        { decision: ModerationDecision.APPROVED, notes: 'Key corrected. Affected attempts were re-marked.', reviewer: 'curriculum', hoursAfter: 20 },
      ],
    }),
    build(student('3A', 0), activity('english-y3:sentence-punctuation', 'extend'), {
      reason: ContentReportReason.BROKEN_ACTIVITY,
      details: 'The drag and drop would not let me move the second card on my tablet.',
      decision: ModerationDecision.REJECTED,
      resolutionNotes:
        'Could not reproduce on the same tablet model. Cleared the cached activity with the learner and it worked. Kept open for one week in case it returns.',
      daysOld: 12,
      reviews: [
        { decision: ModerationDecision.REJECTED, notes: 'Tested on iPad and Android tablet. No fault found.', reviewer: 'support', hoursAfter: 30 },
      ],
    }),
    build(student('5C', 0), lesson('english-y5:comparing-texts'), {
      reason: ContentReportReason.INAPPROPRIATE_CONTENT,
      details: 'One of the extracts talks about a war and it upset me.',
      decision: ModerationDecision.ESCALATED,
      resolutionNotes:
        'Taken seriously and escalated to platform safety for a wellbeing review before any editing decision. The learner was offered an alternative extract the same day.',
      daysOld: 3,
      reviews: [
        { decision: ModerationDecision.PENDING, notes: 'Acknowledged to the learner within the hour.', reviewer: 'support', hoursAfter: 1 },
        { decision: ModerationDecision.ESCALATED, notes: 'Escalated to platform safety. Alternative extract offered meanwhile.', reviewer: 'curriculum', hoursAfter: 4, escalate: true },
      ],
    }),
    build(people.leadTeacherIds['3A'], lesson('science-y3:friction-on-surfaces'), {
      reason: ContentReportReason.AGE_UNSUITABLE,
      details: 'The reading level of the second section is closer to Year 5 than Year 3.',
      decision: ModerationDecision.PENDING,
      resolutionNotes: null,
      daysOld: 2,
      reviews: [
        { decision: ModerationDecision.PENDING, notes: 'Queued for a readability check against the Year 3 band.', reviewer: 'curriculum', hoursAfter: 3 },
      ],
    }),
    build(people.curriculumManagerId, draft ? { activityId: draft.id } : null, {
      reason: ContentReportReason.COPYRIGHT_CONCERN,
      details: 'This draft quotes a passage I cannot find a licence for. Holding it back until we can.',
      decision: ModerationDecision.REMOVED,
      resolutionNotes:
        'Draft withdrawn from the review queue. It stays unpublished until the passage is replaced or licensed, so no learner ever saw it.',
      daysOld: 5,
      reviews: [
        { decision: ModerationDecision.REMOVED, notes: 'Withdrawn from the queue. Author asked to rewrite the extract.', reviewer: 'curriculum', hoursAfter: 2 },
      ],
    }),
    build(student('3A', 1), activity('maths-y3:tables-3-4-8', 'practice'), {
      reason: ContentReportReason.OTHER,
      details: 'The numbers are too small for me to read on the class laptop.',
      decision: ModerationDecision.APPROVED,
      resolutionNotes:
        'Not a content fault. Larger text and increased spacing were switched on in the learner profile, and the class teacher was shown where the setting lives.',
      daysOld: 8,
      reviews: [
        { decision: ModerationDecision.APPROVED, notes: 'Routed to accessibility settings rather than content. Learner confirmed it is readable now.', reviewer: 'support', hoursAfter: 4 },
      ],
    }),
  ];

  return specs.filter((spec): spec is ReportSpec => spec !== null);
}

export async function seedModeration(
  fixture: SchoolFixture,
  curriculum: CurriculumFixture,
  content: ContentFixture,
  people: PeopleFixture,
  escalateToId: string,
  now: Date,
): Promise<ModerationFixture> {
  step('Content reports and moderation reviews (blueprint 03, 05)');

  const context = {
    schoolId: fixture.schoolId,
    supportId: people.supportAgentId,
    curriculumId: people.curriculumManagerId,
    escalateToId,
    now,
  };

  const specs = reportSpecs(curriculum, content, people);
  const reportIds: string[] = [];
  let reviews = 0;

  for (const spec of specs) {
    reportIds.push(await upsertReport(spec, context));
    reviews += spec.reviews.length;
  }

  // Activities waiting on publication get a queue row of their own, so the
  // moderation screen is populated even before anyone files a report.
  for (const activity of content.activities.filter((entry) => entry.status === ContentStatus.IN_REVIEW)) {
    await upsertQueueReview(activity.id, people.curriculumManagerId, daysAgo(4, now));
    reviews += 1;
  }

  const open = specs.filter((spec) => spec.decision === ModerationDecision.PENDING).length;
  const decisions = Object.values(ModerationDecision)
    .map((decision) => `${decision} ${specs.filter((spec) => spec.decision === decision).length}`)
    .join(', ');

  log(`${reportIds.length} content reports, ${reviews} review steps`);
  log(`by decision: ${decisions}`);

  return { reportIds, openReports: open, reviews };
}
