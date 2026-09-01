// ─────────────────────────────────────────────────────────────────────────────
// Seed — assignments
// Blueprint 03 (set work to an individual, group, class, grade or subject cohort)
// and blueprint 04 (monitor it: started, completed, overdue, excused). The only
// file in the assignment seed that touches Prisma; `assignment.plan.ts` decides
// which assignments exist and `assignment.attempts.ts` decides what each learner
// did with one.
//
// Three things worth knowing before editing:
//
//   1. Who the work reaches is not guessed. `resolveTargetStudents` — the same
//      function the API calls when a teacher publishes — expands the stored
//      (type, id) target list against the live roster, so a seeded class
//      assignment covers exactly the learners a real one would.
//   2. `Assignment` has no unique key, so a row is located by
//      `(schoolId, title)`. Titles carry the class code for that reason, and
//      `assertUniqueTitles` fails the run rather than trusting it.
//   3. `AssignmentTarget` and `AssignmentAttempt` both have real compound
//      uniques, so those are plain upserts and re-running changes nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { AssignmentKind, AssignmentState } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import { resolveTargetStudents } from '../../src/modules/assignments/assignments.targets';
import { assertUniqueTitles, planAll } from './assignment.plan';
import type { Directory, PlannedAssignment, PlannedTarget } from './assignment.plan';
import { attemptsFor } from './assignment.attempts';
import type { PlannedAttempt } from './assignment.attempts';
import { log, step } from './helpers';
import type { AssessmentFixture } from './assessment.seed';
import type { AttemptFixture } from './attempts.seed';
import type { ContentFixture } from './content.seed';
import type { CurriculumFixture } from './curriculum.seed';
import type { PeopleFixture } from './people.seed';
import type { SchoolFixture } from './school.seed';

/** One seeded assignment, for the modules that notify about or report on work. */
export interface SeededAssignment {
  id: string;
  title: string;
  kind: AssignmentKind;
  classCode: string | null;
  subjectKey: string;
  gradeKey: string;
  dueAt: Date | null;
  pointsValue: number;
  isPublished: boolean;
  createdById: string;
  /** Learners the target list actually reached, in roster order. */
  studentIds: string[];
}

export interface SeededAssignmentAttempt {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  attemptNumber: number;
  state: AssignmentState;
  isLate: boolean;
  scorePercent: number | null;
  pointsAwarded: number;
  submittedAt: Date | null;
  completedAt: Date | null;
}

export interface AssignmentFixture {
  assignments: SeededAssignment[];
  attempts: SeededAssignmentAttempt[];
  /** Attempts per student id, newest deadline last. */
  byStudent: Record<string, SeededAssignmentAttempt[]>;
  /** Outstanding work past its deadline — what an overdue digest is built from. */
  overdue: SeededAssignmentAttempt[];
  targetRows: number;
}

async function readDirectory(fixture: SchoolFixture, supportGroupId: string): Promise<Directory> {
  const [grades, subjects, classes, group] = await Promise.all([
    prisma.grade.findMany({ where: { schoolId: fixture.schoolId }, select: { id: true, key: true, name: true } }),
    prisma.subject.findMany({ where: { schoolId: fixture.schoolId }, select: { key: true, name: true } }),
    prisma.class.findMany({ where: { schoolId: fixture.schoolId }, select: { code: true, name: true, gradeId: true } }),
    prisma.userGroup.findUnique({ where: { id: supportGroupId }, select: { name: true } }),
  ]);

  const gradeKeyById: Record<string, string> = {};
  const gradeNames: Record<string, string> = {};
  for (const grade of grades) {
    gradeKeyById[grade.id] = grade.key;
    gradeNames[grade.key] = grade.name;
  }

  const subjectNames: Record<string, string> = {};
  for (const subject of subjects) subjectNames[subject.key] = subject.name;

  const classMap: Directory['classes'] = {};
  for (const klass of classes) {
    classMap[klass.code] = { name: klass.name, gradeKey: gradeKeyById[klass.gradeId] ?? '' };
  }

  return {
    classes: classMap,
    gradeNames,
    subjectNames,
    supportGroupName: group?.name ?? 'Support group',
  };
}

/**
 * Who set the work. The plan names a role rather than an id because it is pure;
 * this is where that role meets the seeded staff list.
 */
function creatorOf(plan: PlannedAssignment, people: PeopleFixture): string {
  if (plan.createdBy === 'maths') return people.mathsSpecialistId;
  if (plan.createdBy === 'curriculum') return people.curriculumManagerId;
  const lead = plan.classCode ? people.leadTeacherIds[plan.classCode] : undefined;
  return lead ?? people.curriculumManagerId;
}

interface AssignmentOwners {
  classId: string | null;
  subjectId: string;
  createdById: string;
}

/**
 * Located by `(schoolId, title)` because `Assignment` has no unique key. A second
 * run finds the row it wrote the first time and updates it in place, so ids stay
 * stable for the attempts and targets that hang off them.
 */
async function upsertAssignment(
  fixture: SchoolFixture,
  plan: PlannedAssignment,
  owners: AssignmentOwners,
): Promise<string> {
  const columns = {
    createdById: owners.createdById,
    classId: owners.classId,
    subjectId: owners.subjectId,
    termId: fixture.termId,
    kind: plan.kind,
    instructions: plan.instructions,
    topicId: plan.topicId,
    lessonId: plan.lessonId,
    activityId: plan.activityId,
    assessmentId: plan.assessmentId,
    availableFrom: plan.availableFrom,
    dueAt: plan.dueAt,
    lateBehavior: plan.lateBehavior,
    graceHours: plan.graceHours,
    allowResubmission: plan.allowResubmission,
    maxAttempts: plan.maxAttempts,
    pointsValue: plan.pointsValue,
    estimatedMinutes: plan.estimatedMinutes,
    isPublished: plan.isPublished,
    publishedAt: plan.publishedAt,
    archivedAt: plan.archivedAt,
    notifyOnAssign: plan.notifyOnAssign,
    notifyOnDueSoon: plan.notifyOnDueSoon,
    notifyOnOverdue: plan.notifyOnOverdue,
  };

  const existing = await prisma.assignment.findFirst({
    where: { schoolId: fixture.schoolId, title: plan.title },
    select: { id: true },
  });
  if (existing) {
    await prisma.assignment.update({ where: { id: existing.id }, data: columns });
    return existing.id;
  }
  const created = await prisma.assignment.create({
    data: { schoolId: fixture.schoolId, title: plan.title, ...columns },
    select: { id: true },
  });
  return created.id;
}

/** Real compound unique, so this is a plain upsert and re-running is a no-op. */
async function upsertTargets(assignmentId: string, targets: readonly PlannedTarget[]): Promise<number> {
  for (const target of targets) {
    await prisma.assignmentTarget.upsert({
      where: {
        assignmentId_targetType_targetId: {
          assignmentId,
          targetType: target.targetType,
          targetId: target.targetId,
        },
      },
      update: { targetLabel: target.targetLabel },
      create: {
        assignmentId,
        targetType: target.targetType,
        targetId: target.targetId,
        targetLabel: target.targetLabel,
      },
    });
  }
  return targets.length;
}

/**
 * Attempt rows are never deleted. The planner is deterministic, so a second run
 * writes the same `(assignment, student, attemptNumber)` triples; a learner who
 * leaves the class keeps the record of the work they did, which is what the API
 * does too — `createMissingAttempts` only ever adds.
 */
async function upsertAttempts(
  schoolId: string,
  assignmentId: string,
  assignmentTitle: string,
  planned: readonly PlannedAttempt[],
): Promise<SeededAssignmentAttempt[]> {
  const rows: SeededAssignmentAttempt[] = [];
  for (const attempt of planned) {
    const { studentId, attemptNumber, ...columns } = attempt;
    const saved = await prisma.assignmentAttempt.upsert({
      where: { assignmentId_studentId_attemptNumber: { assignmentId, studentId, attemptNumber } },
      update: columns,
      create: { schoolId, assignmentId, studentId, attemptNumber, ...columns },
      select: { id: true },
    });
    rows.push({
      id: saved.id,
      assignmentId,
      assignmentTitle,
      studentId,
      attemptNumber,
      state: attempt.state,
      isLate: attempt.isLate,
      scorePercent: attempt.scorePercent,
      pointsAwarded: attempt.pointsAwarded,
      submittedAt: attempt.submittedAt,
      completedAt: attempt.completedAt,
    });
  }
  return rows;
}

export async function seedAssignments(
  fixture: SchoolFixture,
  people: PeopleFixture,
  curriculum: CurriculumFixture,
  content: ContentFixture,
  assessments: AssessmentFixture,
  attempts: AttemptFixture,
  now: Date,
): Promise<AssignmentFixture> {
  step('Assignments');

  const directory = await readDirectory(fixture, people.supportGroupId);
  const plans = planAll({ fixture, people, curriculum, content, assessments, directory, now });
  assertUniqueTitles(plans);

  const seeded: SeededAssignment[] = [];
  const allAttempts: SeededAssignmentAttempt[] = [];
  let targetRows = 0;

  for (const [index, plan] of plans.entries()) {
    const owners: AssignmentOwners = {
      classId: plan.classCode ? fixture.classIds[plan.classCode] : null,
      subjectId: fixture.subjectIds[plan.subjectKey],
      createdById: creatorOf(plan, people),
    };
    const assignmentId = await upsertAssignment(fixture, plan, owners);
    targetRows += await upsertTargets(assignmentId, plan.targets);

    // The API's own expansion, against the roster that was just seeded. A class
    // assignment therefore reaches exactly the learners a real one would, and a
    // target naming an archived learner quietly reaches nobody — same as live.
    const reached = new Set(await resolveTargetStudents(fixture.schoolId, plan.targets));
    const students = people.students.filter((student) => reached.has(student.id));

    const planned = attemptsFor({
      assignment: plan,
      students,
      attemptsByStudent: attempts.byStudent,
      teacherId: plan.classCode
        ? (people.leadTeacherIds[plan.classCode] ?? people.curriculumManagerId)
        : people.curriculumManagerId,
      index,
      now,
    });
    const rows = await upsertAttempts(fixture.schoolId, assignmentId, plan.title, planned);
    allAttempts.push(...rows);

    seeded.push({
      id: assignmentId,
      title: plan.title,
      kind: plan.kind,
      classCode: plan.classCode,
      subjectKey: plan.subjectKey,
      gradeKey: plan.gradeKey,
      dueAt: plan.dueAt,
      pointsValue: plan.pointsValue,
      isPublished: plan.isPublished,
      createdById: owners.createdById,
      studentIds: students.map((student) => student.id),
    });
  }

  const byStudent: Record<string, SeededAssignmentAttempt[]> = {};
  for (const attempt of allAttempts) {
    (byStudent[attempt.studentId] ??= []).push(attempt);
  }

  logSummary(seeded, allAttempts, targetRows);

  return {
    assignments: seeded,
    attempts: allAttempts,
    byStudent,
    overdue: allAttempts.filter((attempt) => attempt.state === AssignmentState.OVERDUE),
    targetRows,
  };
}

/**
 * Grouped, not aggregate. Every enum value is listed even when it is zero: a
 * single "N attempts" line is exactly what hid the `hashUnit` avalanche, and a
 * missing `AssignmentState` here means a dashboard tab nobody has ever seen with
 * data in it.
 */
function logSummary(
  assignments: readonly SeededAssignment[],
  attempts: readonly SeededAssignmentAttempt[],
  targetRows: number,
): void {
  const drafts = assignments.filter((assignment) => !assignment.isPublished).length;
  log(`${assignments.length} assignments (${drafts} draft), ${targetRows} target rows`);

  const kinds = Object.values(AssignmentKind)
    .map((kind) => `${kind.toLowerCase()} ${assignments.filter((row) => row.kind === kind).length}`)
    .join(', ');
  log(`kinds: ${kinds}`);

  const states = Object.values(AssignmentState)
    .map((state) => `${state.toLowerCase()} ${attempts.filter((row) => row.state === state).length}`)
    .join(', ');
  log(`${attempts.length} learner attempts`);
  log(`states: ${states}`);

  const late = attempts.filter((row) => row.isLate).length;
  const scored = attempts.filter((row) => row.scorePercent !== null).length;
  const resubmitted = attempts.filter((row) => row.attemptNumber > 1).length;
  log(`${scored} marked, ${late} flagged late, ${resubmitted} resubmissions`);
}
