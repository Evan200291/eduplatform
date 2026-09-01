// ─────────────────────────────────────────────────────────────────────────────
// Seed plan — assignments
// Pure planning for blueprint 03 ("a teacher can assign to an individual, group,
// class, grade, or subject cohort") and blueprint 04 ("monitor started,
// completed, overdue, excused"). Nothing here touches Prisma: `planAll` walks the
// (class, subject) pairs and `assignmentsFor` shapes each one, then
// `assignment.seed.ts` writes what they return.
//
// Two rules the file exists to keep:
//
//   1. Nothing is fabricated that the product decides. Deadlines, grace windows
//      and late behaviour are written as columns here; the rules that read them
//      live in `assignment.attempts.ts`, which imports the product's own
//      `evaluateLateness` rather than mirroring it.
//   2. Shape coverage is positional, not `chance()`-gated. With nine
//      (class, subject) pairs a probability can miss a whole `AssignmentKind` or
//      target type and ship an empty column on the monitor board, so every shape
//      is placed by index and the harness asserts each one appears.
// ─────────────────────────────────────────────────────────────────────────────

import { AssignmentKind, AssignmentTargetType, LateBehavior } from '@prisma/client';

import { daysAgo, daysAhead } from './helpers';
import type { AssessmentFixture, SeededAssessment } from './assessment.seed';
import type { ContentFixture, SeededActivity, SeededLesson } from './content.seed';
import type { CurriculumFixture, SeededTopic } from './curriculum.seed';
import type { DemoStudent, PeopleFixture } from './people.seed';
import type { SchoolFixture } from './school.seed';

/** One row of the target list. `targetId` is a real id; the label is denormalized. */
export interface PlannedTarget {
  targetType: AssignmentTargetType;
  targetId: string;
  targetLabel: string;
}

export interface PlannedAssignment {
  /**
   * Stable identity. `Assignment` has no unique key, so the seed locates a row by
   * `(schoolId, title)` — which means titles have to be unique across the plan.
   * The harness asserts that rather than trusting it.
   */
  title: string;
  kind: AssignmentKind;
  instructions: string | null;
  classCode: string | null;
  subjectKey: string;
  gradeKey: string;
  topicId: string | null;
  lessonId: string | null;
  activityId: string | null;
  assessmentId: string | null;
  availableFrom: Date;
  dueAt: Date | null;
  lateBehavior: LateBehavior;
  graceHours: number;
  allowResubmission: boolean;
  maxAttempts: number | null;
  pointsValue: number;
  estimatedMinutes: number | null;
  isPublished: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
  notifyOnAssign: boolean;
  notifyOnDueSoon: boolean;
  notifyOnOverdue: boolean;
  /** Which member of staff set it. Resolved to an id by the seed. */
  createdBy: 'lead' | 'maths' | 'curriculum';
  targets: PlannedTarget[];
}

/** What an assignment points at. Every shape sets exactly one. */
type Attachment = 'topic' | 'lesson' | 'activity' | 'assessment';

interface Shape {
  kind: AssignmentKind;
  attach: Attachment;
  /** Negative is in the past. Null means "no deadline". */
  dueInDays: number | null;
  late: LateBehavior;
  graceHours: number;
  points: number;
  target: AssignmentTargetType;
  published: boolean;
  archived?: boolean;
  allowResubmission?: boolean;
  maxAttempts?: number | null;
}

/**
 * The eight shapes a demo assignment can take, walked across every
 * (class, subject) pair. Between them they cover all seven `AssignmentKind`
 * values, all four `LateBehavior` values, all five `AssignmentTargetType`
 * values, a draft, an archived one, and deadlines in the past, in the future and
 * absent — so every branch of the monitor board and the learner's "to do" list
 * has a row behind it.
 */
const SHAPES: readonly Shape[] = [
  { kind: AssignmentKind.HOMEWORK, attach: 'activity', dueInDays: -3, late: LateBehavior.ALLOW_LATE_FLAGGED, graceHours: 24, points: 20, target: AssignmentTargetType.CLASS, published: true, allowResubmission: true },
  { kind: AssignmentKind.LESSON, attach: 'lesson', dueInDays: 4, late: LateBehavior.ALLOW_LATE_SILENT, graceHours: 24, points: 10, target: AssignmentTargetType.CLASS, published: true },
  { kind: AssignmentKind.QUIZ, attach: 'activity', dueInDays: -9, late: LateBehavior.BLOCK_AFTER_DUE, graceHours: 0, points: 30, target: AssignmentTargetType.GRADE, published: true, maxAttempts: 1 },
  { kind: AssignmentKind.ASSESSMENT, attach: 'assessment', dueInDays: 9, late: LateBehavior.ALLOW_UNTIL_GRACE_END, graceHours: 48, points: 50, target: AssignmentTargetType.SUBJECT, published: true, maxAttempts: 2 },
  { kind: AssignmentKind.ACTIVITY, attach: 'activity', dueInDays: -1, late: LateBehavior.ALLOW_UNTIL_GRACE_END, graceHours: 36, points: 15, target: AssignmentTargetType.GROUP, published: true, allowResubmission: true },
  { kind: AssignmentKind.TASK, attach: 'topic', dueInDays: null, late: LateBehavior.ALLOW_LATE_FLAGGED, graceHours: 24, points: 0, target: AssignmentTargetType.STUDENT, published: true },
  { kind: AssignmentKind.MISSION, attach: 'topic', dueInDays: 14, late: LateBehavior.ALLOW_LATE_FLAGGED, graceHours: 24, points: 25, target: AssignmentTargetType.CLASS, published: false },
  { kind: AssignmentKind.HOMEWORK, attach: 'lesson', dueInDays: -34, late: LateBehavior.ALLOW_LATE_FLAGGED, graceHours: 24, points: 10, target: AssignmentTargetType.CLASS, published: true, archived: true },
];

/** Six states, placed by position so none of them can be missed. */

const TITLES: Record<Attachment, (label: string) => string> = {
  topic: (label) => `Project: ${label}`,
  lesson: (label) => `Read and reflect: ${label}`,
  activity: (label) => `Practice set: ${label}`,
  assessment: (label) => `Sit the check: ${label}`,
};

const INSTRUCTIONS: Record<Attachment, string> = {
  topic: 'Work through the topic in your own time. Bring one question you would like to go over together.',
  lesson: 'Read the lesson, then write two sentences on what you found hardest. We will start there next time.',
  activity: 'Finish the practice set. If you get stuck twice on the same idea, use a hint rather than guessing.',
  assessment: 'Sit this in one go, somewhere quiet. It is not a test of you — it tells us what to teach next.',
};

export interface AssignmentPlanInput {
  classCode: string;
  classId: string;
  className: string;
  gradeKey: string;
  gradeId: string;
  gradeName: string;
  subjectKey: string;
  subjectId: string;
  subjectName: string;
  /** Topics for this subject and grade, in curriculum order. */
  topics: SeededTopic[];
  lessonByTopic: Record<string, SeededLesson>;
  activitiesByTopic: Record<string, SeededActivity[]>;
  topicCheckByTopicId: Record<string, SeededAssessment>;
  supportGroupId: string;
  supportGroupName: string;
  /** The learner a one-to-one task is set for, and the class roster it came from. */
  focusStudent: DemoStudent | undefined;
  pairIndex: number;
  now: Date;
}

/** The label stored alongside a target id, so a deleted target still reads. */
function targetOf(shape: Shape, input: AssignmentPlanInput): PlannedTarget | null {
  switch (shape.target) {
    case AssignmentTargetType.CLASS:
      return { targetType: shape.target, targetId: input.classId, targetLabel: input.className };
    case AssignmentTargetType.GRADE:
      return { targetType: shape.target, targetId: input.gradeId, targetLabel: input.gradeName };
    case AssignmentTargetType.SUBJECT:
      return { targetType: shape.target, targetId: input.subjectId, targetLabel: input.subjectName };
    case AssignmentTargetType.GROUP:
      return { targetType: shape.target, targetId: input.supportGroupId, targetLabel: input.supportGroupName };
    case AssignmentTargetType.STUDENT:
      // A one-to-one task needs somebody to be for. Where the class roster is
      // empty the shape is dropped rather than targeted at nobody.
      return input.focusStudent
        ? { targetType: shape.target, targetId: input.focusStudent.id, targetLabel: input.focusStudent.displayName }
        : null;
    default:
      return null;
  }
}

/** Resolves the one thing the assignment sets, and the words on the card. */
function attachmentOf(
  shape: Shape,
  topic: SeededTopic,
  input: AssignmentPlanInput,
): { topicId: string | null; lessonId: string | null; activityId: string | null; assessmentId: string | null; label: string; minutes: number | null } | null {
  const lesson = input.lessonByTopic[topic.id];
  const activities = input.activitiesByTopic[topic.id] ?? [];
  const activity = activities[shape.points % Math.max(1, activities.length)];
  const assessment = input.topicCheckByTopicId[topic.id];

  switch (shape.attach) {
    case 'topic':
      return { topicId: topic.id, lessonId: null, activityId: null, assessmentId: null, label: topic.name, minutes: topic.minutes };
    case 'lesson':
      return lesson
        ? { topicId: topic.id, lessonId: lesson.id, activityId: null, assessmentId: null, label: lesson.title, minutes: lesson.estimatedMinutes }
        : null;
    case 'activity':
      return activity
        ? { topicId: topic.id, lessonId: null, activityId: activity.id, assessmentId: null, label: activity.title, minutes: activity.estimatedMinutes }
        : null;
    case 'assessment':
      return assessment
        ? { topicId: topic.id, lessonId: null, activityId: null, assessmentId: assessment.id, label: assessment.title, minutes: 30 }
        : null;
    default:
      return null;
  }
}

/**
 * Two assignments per (class, subject) pair, drawn from `SHAPES` by position.
 * `pairIndex * 2 + slot` walks the whole table, so with nine pairs every shape is
 * used at least twice.
 *
 * Titles carry the class code because they are the seed's identity for the row —
 * `Assignment` has no unique key, so two pairs producing the same title would
 * silently collapse into one.
 */
export function assignmentsFor(input: AssignmentPlanInput): PlannedAssignment[] {
  const rows: PlannedAssignment[] = [];
  if (input.topics.length === 0) return rows;

  for (let slot = 0; slot < 2; slot += 1) {
    const shape = SHAPES[(input.pairIndex * 2 + slot) % SHAPES.length];
    // Later topics for the later slot, so the two assignments in a pair are not
    // both about the same idea.
    const topic = input.topics[(input.pairIndex + slot * 2) % input.topics.length];
    const attachment = attachmentOf(shape, topic, input);
    const target = targetOf(shape, input);
    if (!attachment || !target) continue;

    const dueAt = shape.dueInDays === null ? null : daysAhead(shape.dueInDays, input.now);
    // Set a week before it was due, or three weeks ago when there is no deadline.
    const availableFrom = dueAt ? daysAgo(7, dueAt) : daysAgo(21, input.now);
    const archivedAt = shape.archived ? daysAgo(2, input.now) : null;

    rows.push({
      title: `${TITLES[shape.attach](attachment.label)} (${input.classCode})`,
      kind: shape.kind,
      instructions: INSTRUCTIONS[shape.attach],
      classCode: input.classCode,
      subjectKey: input.subjectKey,
      gradeKey: input.gradeKey,
      topicId: attachment.topicId,
      lessonId: attachment.lessonId,
      activityId: attachment.activityId,
      assessmentId: attachment.assessmentId,
      availableFrom,
      dueAt,
      lateBehavior: shape.late,
      graceHours: shape.graceHours,
      allowResubmission: shape.allowResubmission ?? false,
      maxAttempts: shape.maxAttempts ?? null,
      pointsValue: shape.points,
      estimatedMinutes: attachment.minutes,
      isPublished: shape.published,
      publishedAt: shape.published ? availableFrom : null,
      archivedAt,
      // Blueprint 06: notifications have a purpose. Silent-late work does not
      // chase the learner, which is the whole point of that late behaviour.
      notifyOnAssign: shape.published,
      notifyOnDueSoon: dueAt !== null,
      notifyOnOverdue: shape.late !== LateBehavior.ALLOW_LATE_SILENT && dueAt !== null,
      createdBy: input.subjectKey === 'mathematics' ? 'maths' : slot === 1 ? 'curriculum' : 'lead',
      targets: [target],
    });
  }

  return rows;
}

/**
 * Display names for the target labels. `AssignmentTarget.targetLabel` is
 * denormalized on purpose — it is what the monitor board shows after a class is
 * renamed or a group is archived — so the names are read from the rows that were
 * just seeded rather than restated here.
 */
export interface Directory {
  /** Class name and grade key by class code. */
  classes: Record<string, { name: string; gradeKey: string }>;
  gradeNames: Record<string, string>;
  subjectNames: Record<string, string>;
  supportGroupName: string;
}

export interface SeedContext {
  fixture: SchoolFixture;
  people: PeopleFixture;
  curriculum: CurriculumFixture;
  content: ContentFixture;
  assessments: AssessmentFixture;
  directory: Directory;
  now: Date;
}

/** Two assignments per (class, subject) pair — see the shape table in the plan. */
export function planAll(context: SeedContext): PlannedAssignment[] {
  const { fixture, people, curriculum, content, assessments, directory, now } = context;
  const out: PlannedAssignment[] = [];
  let pairIndex = 0;

  for (const classCode of Object.keys(fixture.classIds)) {
    const klass = directory.classes[classCode];
    if (!klass) continue;
    const roster = people.students.filter((student) => student.classCode === classCode);

    for (const subjectKey of Object.keys(fixture.subjectIds)) {
      const topics = curriculum.topicsBySubjectGrade[`${subjectKey}:${klass.gradeKey}`] ?? [];
      // A subject with no topics for this grade has nothing to set work on.
      if (topics.length === 0) continue;

      out.push(...assignmentsFor({
        classCode,
        classId: fixture.classIds[classCode],
        className: klass.name,
        gradeKey: klass.gradeKey,
        gradeId: fixture.gradeIds[klass.gradeKey],
        gradeName: directory.gradeNames[klass.gradeKey] ?? klass.gradeKey,
        subjectKey,
        subjectId: fixture.subjectIds[subjectKey],
        subjectName: directory.subjectNames[subjectKey] ?? subjectKey,
        topics,
        lessonByTopic: content.lessonByTopic,
        activitiesByTopic: content.activitiesByTopic,
        topicCheckByTopicId: assessments.topicCheckByTopicId,
        supportGroupId: people.supportGroupId,
        supportGroupName: directory.supportGroupName,
        // The one-to-one task goes to whoever needs the most help in the room.
        focusStudent: roster.find((student) => student.band === 'needs-support') ?? roster[0],
        pairIndex,
        now,
      }));
      pairIndex += 1;
    }
  }
  return out;
}

/**
 * `(schoolId, title)` is the seed's identity for an assignment, so a duplicate
 * title would make two planned assignments collapse into one row and silently
 * halve the monitor board. Cheaper to fail here than to debug that.
 */
export function assertUniqueTitles(plans: readonly PlannedAssignment[]): void {
  const seen = new Set<string>();
  for (const plan of plans) {
    if (seen.has(plan.title)) {
      throw new Error(`Duplicate assignment title "${plan.title}" — rows are located by (schoolId, title).`);
    }
    seen.add(plan.title);
  }
}
