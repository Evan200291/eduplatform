// ─────────────────────────────────────────────────────────────────────────────
// Standard reports
// Blueprint 04: "Every report must state what the measure is, where it came from,
// and what it does not prove," and blueprint 12 keeps progress ("did the learner do
// it?") separate from mastery ("can the learner do it?").
//
// Both rules are structural here. Every report in this registry carries its own
// `measureNotes` and `limitationNotes` as data, so the honesty text travels with the
// figures into the API response and into the exported file — it cannot be lost by a
// frontend that forgot to render it. And no report in this file mixes a progress
// column and a mastery column without labelling which is which, because a single
// table with "completed" beside "mastered" invites exactly the reading blueprint 12
// exists to prevent.
//
// The registry lives in code rather than the database because a report definition is
// a piece of software: it has a query, a set of columns, and a claim about what it
// means. The `ReportDefinition` rows the seed creates are the catalogue entry for
// these, not their implementation.
// ─────────────────────────────────────────────────────────────────────────────

import { AssignmentState, AttemptStatus, MasteryLevel, PathItemStatus } from '@prisma/client';
import { prisma } from '../../core/prisma';

export interface ReportColumn {
  key: string;
  label: string;
  /** Drives alignment and export formatting, nothing more. */
  type: 'text' | 'number' | 'percent' | 'date';
}

export interface BuildContext {
  schoolId: string;
  /** Already narrowed to what the caller may see. Never derived from a query param. */
  studentIds: string[];
  classId?: string;
  gradeId?: string;
  subjectId?: string;
  from: Date;
  to: Date;
  limit: number;
}

export interface ReportSpec {
  key: string;
  name: string;
  scopeLevel: 'STUDENT' | 'CLASS' | 'GRADE' | 'SUBJECT' | 'SCHOOL';
  description: string;
  audience: string[];
  /** Blueprint 04: what this measures. */
  measureNotes: string;
  /** Blueprint 04: what it does not prove. */
  limitationNotes: string;
  evidenceSources: string[];
  columns: ReportColumn[];
  build: (context: BuildContext) => Promise<Record<string, unknown>[]>;
}

const MASTERED_ENOUGH: MasteryLevel[] = [MasteryLevel.PROFICIENT, MasteryLevel.MASTERED];

// ── Activity and engagement ─────────────────────────────────────────────────

const engagement: ReportSpec = {
  key: 'engagement.activity-summary',
  name: 'Activity summary',
  scopeLevel: 'CLASS',
  description: 'How much learning activity each learner recorded in the window.',
  audience: ['TEACHER', 'SCHOOL_ADMIN'],
  measureNotes:
    'Counts activities the learner marked complete and sums the time the product recorded them as active, for the window shown. Each figure comes from ProgressRecord rows, which are a log of product use.',
  limitationNotes:
    'This does not show what the learner can do. Time on task is measured by the product and will over-count a tab left open and under-count work done on paper. A low figure may mean a quiet week, illness, or a device problem, and says nothing about ability or effort.',
  evidenceSources: ['ProgressRecord'],
  columns: [
    { key: 'learner', label: 'Learner', type: 'text' },
    { key: 'activitiesCompleted', label: 'Activities completed', type: 'number' },
    { key: 'activitiesStarted', label: 'Activities started', type: 'number' },
    { key: 'minutes', label: 'Minutes active', type: 'number' },
    { key: 'lastActive', label: 'Last active', type: 'date' },
  ],
  build: async (context) => {
    const rows = await prisma.progressRecord.findMany({
      where: {
        schoolId: context.schoolId,
        studentId: { in: context.studentIds },
        lastActivityAt: { gte: context.from, lte: context.to },
      },
      select: {
        studentId: true,
        status: true,
        timeSpentSeconds: true,
        lastActivityAt: true,
      },
    });

    const names = await nameMap(context.studentIds);
    const totals = new Map<
      string,
      { completed: number; started: number; seconds: number; last: Date | null }
    >();

    for (const studentId of context.studentIds) {
      totals.set(studentId, { completed: 0, started: 0, seconds: 0, last: null });
    }
    for (const row of rows) {
      const bucket = totals.get(row.studentId);
      if (!bucket) continue;
      bucket.started += 1;
      if (row.status === PathItemStatus.COMPLETED) bucket.completed += 1;
      bucket.seconds += row.timeSpentSeconds;
      if (!bucket.last || row.lastActivityAt > bucket.last) bucket.last = row.lastActivityAt;
    }

    return [...totals.entries()]
      .map(([studentId, bucket]) => ({
        learner: names.get(studentId) ?? studentId,
        activitiesCompleted: bucket.completed,
        activitiesStarted: bucket.started,
        minutes: Math.round(bucket.seconds / 60),
        lastActive: bucket.last,
      }))
      .sort((a, b) => b.activitiesCompleted - a.activitiesCompleted)
      .slice(0, context.limit);
  },
};

// ── Mastery ─────────────────────────────────────────────────────────────────

const masteryCoverage: ReportSpec = {
  key: 'mastery.coverage',
  name: 'Mastery coverage',
  scopeLevel: 'CLASS',
  description: 'Where each learner currently sits across the topics they have evidence for.',
  audience: ['TEACHER', 'SCHOOL_ADMIN'],
  measureNotes:
    'Counts MasteryRecord rows by level for each learner, at topic level only. Every row carries the evidence source it was inferred from, and rows a teacher has overridden are counted separately so a professional judgment is never presented as a system inference.',
  limitationNotes:
    'A learner can only be counted on topics they have attempted, so a small number here often means little evidence rather than little ability. Mastery is inferred and decays if unpractised; it is a current best estimate, not a grade, and it does not measure effort, progress over time, or anything the platform has not assessed.',
  evidenceSources: ['MasteryRecord', 'TeacherAssessment'],
  columns: [
    { key: 'learner', label: 'Learner', type: 'text' },
    { key: 'topicsWithEvidence', label: 'Topics with evidence', type: 'number' },
    { key: 'proficientOrBetter', label: 'Proficient or better', type: 'number' },
    { key: 'developing', label: 'Still developing', type: 'number' },
    { key: 'teacherJudged', label: 'Teacher-judged', type: 'number' },
    { key: 'reviewDue', label: 'Due for review', type: 'number' },
  ],
  build: async (context) => {
    const rows = await prisma.masteryRecord.findMany({
      where: {
        schoolId: context.schoolId,
        studentId: { in: context.studentIds },
        objectiveId: null,
        ...(context.subjectId ? { subjectId: context.subjectId } : {}),
      },
      select: {
        studentId: true,
        level: true,
        teacherOverride: true,
        reviewDueAt: true,
      },
    });

    const names = await nameMap(context.studentIds);
    const totals = new Map<
      string,
      { evidence: number; good: number; developing: number; judged: number; review: number }
    >();
    for (const studentId of context.studentIds) {
      totals.set(studentId, { evidence: 0, good: 0, developing: 0, judged: 0, review: 0 });
    }

    const now = new Date();
    for (const row of rows) {
      const bucket = totals.get(row.studentId);
      if (!bucket) continue;
      if (row.level === MasteryLevel.NOT_ASSESSED) continue;
      bucket.evidence += 1;
      if (MASTERED_ENOUGH.includes(row.level)) bucket.good += 1;
      else bucket.developing += 1;
      if (row.teacherOverride) bucket.judged += 1;
      if (row.reviewDueAt && row.reviewDueAt <= now) bucket.review += 1;
    }

    return [...totals.entries()]
      .map(([studentId, bucket]) => ({
        learner: names.get(studentId) ?? studentId,
        topicsWithEvidence: bucket.evidence,
        proficientOrBetter: bucket.good,
        developing: bucket.developing,
        teacherJudged: bucket.judged,
        reviewDue: bucket.review,
      }))
      .sort((a, b) => b.proficientOrBetter - a.proficientOrBetter)
      .slice(0, context.limit);
  },
};

// ── Assignments ─────────────────────────────────────────────────────────────

const assignmentCompletion: ReportSpec = {
  key: 'assignments.completion',
  name: 'Assignment completion',
  scopeLevel: 'CLASS',
  description: 'What was set, what came back, and what is still outstanding.',
  audience: ['TEACHER', 'SCHOOL_ADMIN'],
  measureNotes:
    'Counts AssignmentAttempt rows by state for work due in the window. "Late" is the flag set by the assignment\'s own late-behaviour rules at the moment of submission, and excused work is counted as excused rather than as missing.',
  limitationNotes:
    'Handing work in is not the same as understanding it, and a score here is a mark on one task rather than a measure of mastery. Outstanding work may have been done on paper, excused verbally, or set to a learner who was absent; treat a gap as a question to ask, not a conclusion.',
  evidenceSources: ['Assignment', 'AssignmentAttempt'],
  columns: [
    { key: 'learner', label: 'Learner', type: 'text' },
    { key: 'set', label: 'Set', type: 'number' },
    { key: 'completed', label: 'Completed', type: 'number' },
    { key: 'late', label: 'Late', type: 'number' },
    { key: 'excused', label: 'Excused', type: 'number' },
    { key: 'outstanding', label: 'Outstanding', type: 'number' },
    { key: 'averageScore', label: 'Average score', type: 'percent' },
  ],
  build: async (context) => {
    const rows = await prisma.assignmentAttempt.findMany({
      where: {
        schoolId: context.schoolId,
        studentId: { in: context.studentIds },
        assignment: {
          ...(context.classId ? { classId: context.classId } : {}),
          ...(context.subjectId ? { subjectId: context.subjectId } : {}),
          archivedAt: null,
          availableFrom: { lte: context.to },
        },
        createdAt: { lte: context.to },
      },
      select: {
        studentId: true,
        state: true,
        isLate: true,
        excusedAt: true,
        scorePercent: true,
      },
    });

    const names = await nameMap(context.studentIds);
    const totals = new Map<
      string,
      {
        set: number;
        completed: number;
        late: number;
        excused: number;
        scoreSum: number;
        scored: number;
      }
    >();
    for (const studentId of context.studentIds) {
      totals.set(studentId, { set: 0, completed: 0, late: 0, excused: 0, scoreSum: 0, scored: 0 });
    }

    for (const row of rows) {
      const bucket = totals.get(row.studentId);
      if (!bucket) continue;
      bucket.set += 1;
      if (row.excusedAt) {
        bucket.excused += 1;
        continue;
      }
      if (row.state === AssignmentState.COMPLETED || row.state === AssignmentState.SUBMITTED) {
        bucket.completed += 1;
      }
      if (row.isLate) bucket.late += 1;
      if (row.scorePercent !== null) {
        bucket.scoreSum += row.scorePercent;
        bucket.scored += 1;
      }
    }

    return [...totals.entries()]
      .map(([studentId, bucket]) => ({
        learner: names.get(studentId) ?? studentId,
        set: bucket.set,
        completed: bucket.completed,
        late: bucket.late,
        excused: bucket.excused,
        outstanding: Math.max(0, bucket.set - bucket.completed - bucket.excused),
        averageScore: bucket.scored > 0 ? Math.round(bucket.scoreSum / bucket.scored) : null,
      }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, context.limit);
  },
};

// ── Assessments ──────────────────────────────────────────────────────────────

const assessmentResults: ReportSpec = {
  key: 'assessment.results',
  name: 'Assessment results',
  scopeLevel: 'CLASS',
  description: 'Screening and placement outcomes recorded for each learner in the window.',
  audience: ['TEACHER', 'SCHOOL_ADMIN'],
  measureNotes:
    'Counts completed AssessmentAttempt rows per learner, their average and best scored percentage, and how many attempts placed above the assessment\'s own pass threshold. Each figure is the product\'s scoring of what was submitted.',
  limitationNotes:
    'A score reflects performance on the items presented in one sitting, which an adaptive assessment selects based on prior answers, so scores are not directly comparable across learners who saw different items. It is not a mastery judgment on its own — pair it with the mastery coverage report before drawing a conclusion.',
  evidenceSources: ['AssessmentAttempt'],
  columns: [
    { key: 'learner', label: 'Learner', type: 'text' },
    { key: 'attempts', label: 'Completed attempts', type: 'number' },
    { key: 'averageScore', label: 'Average score', type: 'percent' },
    { key: 'bestScore', label: 'Best score', type: 'percent' },
    { key: 'passed', label: 'Attempts above pass threshold', type: 'number' },
    { key: 'lastCompleted', label: 'Last completed', type: 'date' },
  ],
  build: async (context) => {
    const rows = await prisma.assessmentAttempt.findMany({
      where: {
        schoolId: context.schoolId,
        studentId: { in: context.studentIds },
        status: AttemptStatus.COMPLETED,
        isPractice: false,
        completedAt: { gte: context.from, lte: context.to },
        ...(context.subjectId ? { assessment: { subjectId: context.subjectId } } : {}),
      },
      select: {
        studentId: true,
        scorePercent: true,
        completedAt: true,
        assessment: { select: { passThreshold: true } },
      },
    });

    const names = await nameMap(context.studentIds);
    const totals = new Map<
      string,
      { attempts: number; scoreSum: number; scored: number; best: number | null; passed: number; last: Date | null }
    >();
    for (const studentId of context.studentIds) {
      totals.set(studentId, { attempts: 0, scoreSum: 0, scored: 0, best: null, passed: 0, last: null });
    }

    for (const row of rows) {
      const bucket = totals.get(row.studentId);
      if (!bucket) continue;
      bucket.attempts += 1;
      if (row.scorePercent !== null) {
        bucket.scoreSum += row.scorePercent;
        bucket.scored += 1;
        bucket.best = bucket.best === null ? row.scorePercent : Math.max(bucket.best, row.scorePercent);
        if (row.scorePercent >= row.assessment.passThreshold) bucket.passed += 1;
      }
      if (row.completedAt && (!bucket.last || row.completedAt > bucket.last)) bucket.last = row.completedAt;
    }

    return [...totals.entries()]
      .map(([studentId, bucket]) => ({
        learner: names.get(studentId) ?? studentId,
        attempts: bucket.attempts,
        averageScore: bucket.scored > 0 ? Math.round(bucket.scoreSum / bucket.scored) : null,
        bestScore: bucket.best,
        passed: bucket.passed,
        lastCompleted: bucket.last,
      }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, context.limit);
  },
};

// ── One learner, in detail ──────────────────────────────────────────────────

const learnerTimeline: ReportSpec = {
  key: 'student.timeline',
  name: 'Learner timeline',
  scopeLevel: 'STUDENT',
  description: 'One learner’s recorded activity, newest first.',
  audience: ['TEACHER', 'SCHOOL_ADMIN', 'PARENT'],
  measureNotes:
    'Lists ProgressRecord rows for the learner in the window, one line per activity, with the status and score the product recorded at the time.',
  limitationNotes:
    'A timeline is a log of product use, not a record of learning. Scores are from single attempts and are not aggregated into any judgment; absence of a line means the platform recorded nothing, which is not the same as nothing having happened.',
  evidenceSources: ['ProgressRecord'],
  columns: [
    { key: 'when', label: 'When', type: 'date' },
    { key: 'topic', label: 'Topic', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'score', label: 'Best score', type: 'percent' },
    { key: 'minutes', label: 'Minutes', type: 'number' },
    { key: 'attempts', label: 'Attempts', type: 'number' },
  ],
  build: async (context) => {
    const rows = await prisma.progressRecord.findMany({
      where: {
        schoolId: context.schoolId,
        studentId: { in: context.studentIds },
        lastActivityAt: { gte: context.from, lte: context.to },
      },
      select: {
        lastActivityAt: true,
        status: true,
        bestScorePercent: true,
        timeSpentSeconds: true,
        attemptCount: true,
        topic: { select: { name: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
      take: context.limit,
    });

    return rows.map((row) => ({
      when: row.lastActivityAt,
      topic: row.topic?.name ?? '—',
      status: row.status,
      score: row.bestScorePercent,
      minutes: Math.round(row.timeSpentSeconds / 60),
      attempts: row.attemptCount,
    }));
  },
};

// ── Whole school ────────────────────────────────────────────────────────────

const schoolUsage: ReportSpec = {
  key: 'school.usage',
  name: 'School usage',
  scopeLevel: 'SCHOOL',
  description: 'How much the platform is being used, by class.',
  audience: ['SCHOOL_ADMIN', 'ORG_ADMIN'],
  measureNotes:
    'For each class, the number of learners with any recorded activity in the window and the total activities they completed. Counts come from ProgressRecord rows joined to active class memberships.',
  limitationNotes:
    'This is a usage measure and nothing else. It does not indicate teaching quality, learning gain, or whether the platform is being used well; a class using it twice a week deliberately will look worse than one using it daily without purpose.',
  evidenceSources: ['ProgressRecord', 'ClassMembership'],
  columns: [
    { key: 'className', label: 'Class', type: 'text' },
    { key: 'learners', label: 'Learners', type: 'number' },
    { key: 'activeLearners', label: 'Active learners', type: 'number' },
    { key: 'activitiesCompleted', label: 'Activities completed', type: 'number' },
    { key: 'minutes', label: 'Minutes active', type: 'number' },
  ],
  build: async (context) => {
    const classes = await prisma.class.findMany({
      where: { schoolId: context.schoolId, archivedAt: null },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { isActive: true, user: { primaryRole: 'STUDENT' } },
          select: { userId: true },
        },
      },
      take: context.limit,
    });

    const output: Record<string, unknown>[] = [];
    for (const group of classes) {
      const learnerIds = group.memberships
        .map((membership) => membership.userId)
        .filter((id) => context.studentIds.includes(id));

      if (learnerIds.length === 0) {
        output.push({
          className: group.name,
          learners: group.memberships.length,
          activeLearners: 0,
          activitiesCompleted: 0,
          minutes: 0,
        });
        continue;
      }

      const rows = await prisma.progressRecord.findMany({
        where: {
          studentId: { in: learnerIds },
          lastActivityAt: { gte: context.from, lte: context.to },
        },
        select: { studentId: true, status: true, timeSpentSeconds: true },
      });

      const active = new Set(rows.map((row) => row.studentId));
      output.push({
        className: group.name,
        learners: group.memberships.length,
        activeLearners: active.size,
        activitiesCompleted: rows.filter((row) => row.status === PathItemStatus.COMPLETED).length,
        minutes: Math.round(rows.reduce((sum, row) => sum + row.timeSpentSeconds, 0) / 60),
      });
    }

    return output.sort(
      (a, b) => Number(b.activitiesCompleted ?? 0) - Number(a.activitiesCompleted ?? 0),
    );
  },
};

// ── The registry ────────────────────────────────────────────────────────────

export const STANDARD_REPORTS: ReportSpec[] = [
  engagement,
  masteryCoverage,
  assignmentCompletion,
  assessmentResults,
  learnerTimeline,
  schoolUsage,
];

export function findReport(key: string): ReportSpec | undefined {
  return STANDARD_REPORTS.find((report) => report.key === key);
}

/** Learner names, once, so a builder never queries per row. */
async function nameMap(studentIds: string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const learners = await prisma.user.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, displayName: true },
  });
  return new Map(learners.map((learner) => [learner.id, learner.displayName]));
}
