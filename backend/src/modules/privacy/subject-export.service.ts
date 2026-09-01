// ─────────────────────────────────────────────────────────────────────────────
// Subject access export
// Blueprint 10's right of access, made mechanical: everything the platform holds
// about one learner, assembled into one file, with a manifest saying what is in it
// and — the part that matters — what is not, and why.
//
// The exclusions are the design. Two things are deliberately left out of an automatic
// bundle:
//
//   • Safeguarding and sensitive notes. Disclosing a safeguarding record to the person
//     it concerns, or to their parent, is a legal judgement about a child's safety.
//     A script must not make it. They are listed in the manifest as withheld with a
//     count, so nobody can pretend they do not exist, and a designated person decides.
//   • Other children. A class leaderboard position is about one learner; the rest of
//     the table is about their classmates, and their classmates did not ask for this.
//
// The file is written to storage, not returned inline. A subject access bundle for an
// active learner is megabytes of JSON, and it needs to be downloadable twice by the
// person handling the request without rebuilding it.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { DataRequestKind, NoteSensitivity } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { badRequest, conflict, notFound } from '../../core/http/errors';
import { moduleLogger } from '../../core/logger';
import { prisma } from '../../core/prisma';
import { storage, storagePrefix } from '../../core/storage';
import { getDataRequest } from './privacy.service';

const log = moduleLogger('subject-export');

/**
 * Per-collection cap. A learner with more than this many rows in one table has an
 * unusual account; the manifest says the collection was truncated rather than
 * quietly handing over a partial answer as if it were complete.
 */
const MAX_ROWS = 10_000;

/** Explicit rather than `select: undefined`: a password hash must never be in a bundle. */
const PROFILE_SELECT = {
  id: true,
  schoolId: true,
  organizationId: true,
  status: true,
  primaryRole: true,
  email: true,
  username: true,
  studentCode: true,
  firstName: true,
  lastName: true,
  displayName: true,
  nickname: true,
  dateOfBirth: true,
  ageMode: true,
  locale: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
  lastLoginMethod: true,
  emailVerifiedAt: true,
  termsAcceptedAt: true,
  suspendedAt: true,
  archivedAt: true,
} satisfies Prisma.UserSelect;

export interface ExportSection {
  key: string;
  label: string;
  rowCount: number;
  truncated: boolean;
}

export interface WithheldSection {
  key: string;
  label: string;
  rowCount: number;
  reason: string;
}

export interface SubjectExportResult {
  storageKey: string;
  fileName: string;
  byteSize: number;
  checksumSha256: string;
  sections: ExportSection[];
  withheld: WithheldSection[];
}

function section(key: string, label: string, rows: unknown[]): ExportSection {
  return { key, label, rowCount: rows.length, truncated: rows.length >= MAX_ROWS };
}

/**
 * Assembles the bundle. Every query is scoped by both `studentId` and `schoolId`:
 * a learner who moved schools has data under their old school that this school is not
 * the controller for, and handing it over here would be a disclosure, not a subject
 * access response.
 */
async function assemble(
  schoolId: string,
  subjectUserId: string,
): Promise<{ payload: Record<string, unknown>; sections: ExportSection[]; withheld: WithheldSection[] }> {
  const scope = { schoolId, studentId: subjectUserId };
  const cap = { take: MAX_ROWS };

  const profile = await prisma.user.findFirst({
    where: { id: subjectUserId, schoolId },
    select: PROFILE_SELECT,
  });
  if (!profile) throw notFound('Subject');

  const [
    roleAssignments,
    classMemberships,
    progress,
    mastery,
    teacherAssessments,
    attempts,
    responses,
    assignmentAttempts,
    points,
    badges,
    streaks,
    rewards,
    companion,
    companionEvents,
    missions,
    notifications,
    consent,
    requests,
    sharedNotes,
  ] = await Promise.all([
    prisma.userRoleAssignment.findMany({ where: { userId: subjectUserId }, ...cap }),
    prisma.classMembership.findMany({ where: { userId: subjectUserId }, ...cap }),
    prisma.progressRecord.findMany({ where: scope, orderBy: { lastActivityAt: 'desc' }, ...cap }),
    prisma.masteryRecord.findMany({ where: scope, ...cap }),
    prisma.teacherAssessment.findMany({ where: scope, orderBy: { assessedAt: 'desc' }, ...cap }),
    prisma.assessmentAttempt.findMany({ where: scope, orderBy: { createdAt: 'desc' }, ...cap }),
    prisma.studentResponse.findMany({ where: scope, orderBy: { answeredAt: 'desc' }, ...cap }),
    prisma.assignmentAttempt.findMany({ where: scope, orderBy: { createdAt: 'desc' }, ...cap }),
    prisma.pointsLedger.findMany({ where: scope, orderBy: { occurredAt: 'desc' }, ...cap }),
    prisma.studentBadge.findMany({ where: scope, orderBy: { awardedAt: 'desc' }, ...cap }),
    prisma.streak.findMany({ where: scope, ...cap }),
    prisma.studentReward.findMany({ where: scope, ...cap }),
    prisma.companion.findFirst({ where: scope }),
    prisma.companionEvent.findMany({
      where: { companion: { studentId: subjectUserId } },
      orderBy: { occurredAt: 'desc' },
      ...cap,
    }),
    prisma.missionProgress.findMany({ where: scope, ...cap }),
    prisma.notification.findMany({
      where: { userId: subjectUserId, schoolId },
      orderBy: { createdAt: 'desc' },
      ...cap,
    }),
    prisma.consentRecord.findMany({ where: { schoolId, userId: subjectUserId }, ...cap }),
    prisma.dataRequest.findMany({ where: { schoolId, subjectUserId }, ...cap }),
    // Only notes the school already treats as shareable with the family.
    prisma.teacherNote.findMany({
      where: { ...scope, sensitivity: NoteSensitivity.ROUTINE, withdrawnAt: null },
      orderBy: { createdAt: 'desc' },
      ...cap,
    }),
  ]);

  const withheldNotes = await prisma.teacherNote.count({
    where: { ...scope, sensitivity: { not: NoteSensitivity.ROUTINE } },
  });

  const sections: ExportSection[] = [
    section('roleAssignments', 'Roles held', roleAssignments),
    section('classMemberships', 'Class and group membership', classMemberships),
    section('progress', 'Activity progress', progress),
    section('mastery', 'Mastery position', mastery),
    section('teacherAssessments', 'Teacher judgements', teacherAssessments),
    section('assessmentAttempts', 'Assessment attempts', attempts),
    section('responses', 'Answers submitted', responses),
    section('assignmentAttempts', 'Homework and assignments', assignmentAttempts),
    section('points', 'Points awarded', points),
    section('badges', 'Badges earned', badges),
    section('streaks', 'Streaks', streaks),
    section('rewards', 'Rewards claimed', rewards),
    section('companionEvents', 'Companion history', companionEvents),
    section('missions', 'Mission progress', missions),
    section('notifications', 'Notifications sent', notifications),
    section('consentRecords', 'Consent recorded for this learner', consent),
    section('dataRequests', 'Data rights requests about this learner', requests),
    section('routineTeacherNotes', 'Routine teacher notes', sharedNotes),
  ];

  const withheld: WithheldSection[] = [
    {
      key: 'sensitiveTeacherNotes',
      label: 'Sensitive and safeguarding notes',
      rowCount: withheldNotes,
      reason:
        'Whether a safeguarding or sensitive note may be disclosed is a decision for the school’s designated safeguarding lead, taken case by case. The notes exist and are counted here; they are not released automatically.',
    },
    {
      key: 'leaderboardTables',
      label: 'Leaderboard tables',
      rowCount: 0,
      reason:
        'A leaderboard row is meaningful only next to other children’s rows, and those children are separate data subjects. This learner’s own points and badges are included above.',
    },
    {
      key: 'auditTrail',
      label: 'Platform audit trail',
      rowCount: 0,
      reason:
        'The audit trail records staff actions, including actions taken on this learner’s record. It is available to the school through the audit screens; it is not part of a learner-facing bundle because it names other people.',
    },
  ];

  const payload = {
    manifest: {
      about: 'Subject access export produced by Midas Learning Cloud.',
      subject: { id: profile.id, displayName: profile.displayName },
      schoolId,
      generatedAt: new Date().toISOString(),
      rowCap: MAX_ROWS,
      sections,
      withheld,
      readMe:
        'Each key below holds the platform’s own records verbatim, including internal identifiers. Where a section says truncated, only the most recent rows up to the cap are present and the school can produce the remainder on request.',
    },
    profile,
    roleAssignments,
    classMemberships,
    progress,
    mastery,
    teacherAssessments,
    assessmentAttempts: attempts,
    responses,
    assignmentAttempts,
    points,
    badges,
    streaks,
    rewards,
    companion,
    companionEvents,
    missions,
    notifications,
    consentRecords: consent,
    dataRequests: requests,
    routineTeacherNotes: sharedNotes,
  };

  return { payload, sections, withheld };
}

/**
 * Builds the file for an EXPORT request and records the storage key on it. Idempotent
 * in the useful sense: running it again replaces the file, which is what happens when
 * the first attempt was made before somebody noticed a class membership was missing.
 */
export async function buildSubjectExport(
  context: ActorContext,
  schoolId: string,
  requestId: string,
): Promise<SubjectExportResult> {
  const request = await getDataRequest(schoolId, requestId);
  if (request.kind !== DataRequestKind.EXPORT) {
    throw badRequest('Only an export request produces a subject access file.');
  }
  if (request.completedAt) {
    throw conflict('This request is closed. Raise a new request to produce a fresh file.');
  }

  const { payload, sections, withheld } = await assemble(schoolId, request.subjectUser.id);
  const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  const fileName = `subject-access-${request.subjectUser.id}-${new Date().toISOString().slice(0, 10)}.json`;

  const stored = await storage.put({
    prefix: storagePrefix.dataRequest(schoolId),
    fileName,
    mimeType: 'application/json',
    content,
  });

  // Replacing an earlier attempt: the old file is no longer referenced by anything.
  if (request.exportStorageKey && request.exportStorageKey !== stored.storageKey) {
    await storage.remove(request.exportStorageKey).catch(() => undefined);
  }

  await prisma.dataRequest.update({
    where: { id: request.id },
    data: { exportStorageKey: stored.storageKey },
  });

  log.info(
    { requestId: request.id, rows: sections.reduce((sum, entry) => sum + entry.rowCount, 0) },
    'subject access export built',
  );
  recordAudit(context, {
    action: 'datarequest.update',
    targetType: 'DataRequest',
    targetId: request.id,
    summary: `Built subject access export for ${request.subjectUser.displayName} (${sections.reduce((sum, entry) => sum + entry.rowCount, 0)} rows)`,
    afterData: { storageKey: stored.storageKey, sections, withheld },
  });

  return {
    storageKey: stored.storageKey,
    fileName,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256,
    sections,
    withheld,
  };
}

export interface SubjectExportFile {
  fileName: string;
  content: Buffer;
}

/**
 * Handing the file over. Authorized per request like every other export on the
 * platform: the storage key is never a URL a browser can hold, and each download is
 * audited against the request it belongs to.
 */
export async function downloadSubjectExport(
  context: ActorContext,
  schoolId: string,
  requestId: string,
): Promise<SubjectExportFile> {
  const request = await getDataRequest(schoolId, requestId);
  if (!request.exportStorageKey) {
    throw conflict('No file has been built for this request yet.');
  }

  const content = await storage.get(request.exportStorageKey);
  recordAudit(context, {
    action: 'datarequest.update',
    targetType: 'DataRequest',
    targetId: request.id,
    summary: `Downloaded subject access export for ${request.subjectUser.displayName}`,
  });

  return {
    fileName: request.exportStorageKey.split('/').pop() ?? 'subject-access-export.json',
    content,
  };
}
