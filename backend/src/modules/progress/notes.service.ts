// ─────────────────────────────────────────────────────────────────────────────
// Teacher notes
// Blueprint 04: "Notes have visibility rules", sensitive notes need stricter
// permissions plus an audit history, and safeguarding notes are *escalated rather
// than shared*. Those three sentences drive everything in this file:
//
//   • visibility decides who may read the note at all
//   • sensitivity decides whether `note.read.sensitive` is additionally required
//   • a SAFEGUARDING note can never be PARENT_VISIBLE, on create or on update
//
// The author always reads their own notes. Nothing here is ever hard-deleted: a
// note is withdrawn with a reason, so the record shows it existed and why it was
// retracted.
//
// A learner never reaches these endpoints — no student or parent role holds
// `note.read`. PARENT_VISIBLE therefore labels a note as *shareable* in a report
// pack; it does not grant a parent an API read here.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { NoteSensitivity, NoteVisibility } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext, AuthenticatedActor } from '../../core/context';
import { badRequest, conflict, forbidden, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import { accessibleStudentIds, assertCanViewStudent } from '../../core/rbac/scope.service';
import type {
  CreateNoteInput,
  EscalateNoteInput,
  NoteListQuery,
  UpdateNoteInput,
} from './progress.validation';

const NOTE_SELECT = {
  id: true,
  studentId: true,
  authorId: true,
  kind: true,
  visibility: true,
  sensitivity: true,
  title: true,
  body: true,
  followUpDueAt: true,
  followUpDoneAt: true,
  escalatedAt: true,
  escalatedToId: true,
  withdrawnAt: true,
  withdrawnById: true,
  withdrawReason: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, firstName: true, lastName: true, displayName: true } },
  author: { select: { id: true, displayName: true, primaryRole: true } },
} satisfies Prisma.TeacherNoteSelect;

const RESTRICTED: NoteSensitivity[] = [NoteSensitivity.SENSITIVE, NoteSensitivity.SAFEGUARDING];

/**
 * The `where` clause expressing "notes this actor may read".
 *
 * A note the actor may not read is filtered out rather than raising, so a shared
 * screen never reveals that a private note exists at all.
 */
function readableNotes(actor: AuthenticatedActor): Prisma.TeacherNoteWhereInput {
  const canReadSensitive = actor.permissions.has('note.read.sensitive');

  // The safeguarding lead reads everything, including another teacher's private note
  // — that is the point of the elevated grant.
  if (canReadSensitive) return {};

  return {
    OR: [
      { authorId: actor.userId },
      {
        // Someone else's note: shared visibility and routine sensitivity only.
        authorId: { not: actor.userId },
        visibility: { not: NoteVisibility.PRIVATE_TEACHER },
        sensitivity: { notIn: RESTRICTED },
      },
    ],
  };
}

/** Blueprint 04: a safeguarding concern is escalated, never shared with a parent. */
function assertSafeguardingNotShared(
  sensitivity: NoteSensitivity,
  visibility: NoteVisibility,
): void {
  if (sensitivity === NoteSensitivity.SAFEGUARDING && visibility === NoteVisibility.PARENT_VISIBLE) {
    throw badRequest(
      'A safeguarding note cannot be parent-visible. Escalate it to the safeguarding lead instead.',
    );
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listNotes(context: ActorContext, schoolId: string, query: NoteListQuery) {
  const { skip, take } = toSkipTake(query);
  const allowed = await accessibleStudentIds(context.actor, context.tenant);

  const where: Prisma.TeacherNoteWhereInput = {
    schoolId,
    ...readableNotes(context.actor),
    ...(allowed === null ? {} : { studentId: { in: allowed } }),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.authorId ? { authorId: query.authorId } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.visibility ? { visibility: query.visibility } : {}),
    ...(query.sensitivity ? { sensitivity: query.sensitivity } : {}),
    ...(query.escalatedOnly ? { escalatedAt: { not: null } } : {}),
    ...(query.followUpDue ? { followUpDueAt: { not: null, lte: new Date() }, followUpDoneAt: null } : {}),
    ...(query.includeWithdrawn ? {} : { withdrawnAt: null }),
    ...(query.since ? { createdAt: { gte: query.since } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.teacherNote.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }],
      select: NOTE_SELECT,
    }),
    prisma.teacherNote.count({ where }),
  ]);

  return { items, totalItems };
}

export async function getNote(context: ActorContext, schoolId: string, id: string) {
  const note = await prisma.teacherNote.findFirst({
    where: { id, schoolId, ...readableNotes(context.actor) },
    select: NOTE_SELECT,
  });
  if (!note) throw notFound('Note');
  await assertCanViewStudent(context.actor, context.tenant, note.studentId);
  return note;
}

/** The counts a teacher's own dashboard needs: what is still owed, and by when. */
export async function getNoteSummary(context: ActorContext, schoolId: string) {
  const now = new Date();
  const mine: Prisma.TeacherNoteWhereInput = { schoolId, authorId: context.actor.userId, withdrawnAt: null };

  const [followUpOverdue, followUpUpcoming, escalatedOpen, total] = await Promise.all([
    prisma.teacherNote.count({
      where: { ...mine, followUpDoneAt: null, followUpDueAt: { not: null, lte: now } },
    }),
    prisma.teacherNote.count({
      where: { ...mine, followUpDoneAt: null, followUpDueAt: { gt: now } },
    }),
    prisma.teacherNote.count({
      where: {
        schoolId,
        withdrawnAt: null,
        escalatedAt: { not: null },
        ...(context.actor.permissions.has('note.read.sensitive')
          ? {}
          : { escalatedToId: context.actor.userId }),
      },
    }),
    prisma.teacherNote.count({ where: mine }),
  ]);

  return { followUpOverdue, followUpUpcoming, escalatedOpen, authored: total };
}

// ── Writing ─────────────────────────────────────────────────────────────────

export async function createNote(context: ActorContext, schoolId: string, input: CreateNoteInput) {
  await assertCanViewStudent(context.actor, context.tenant, input.studentId);
  assertSafeguardingNotShared(input.sensitivity, input.visibility);

  if (RESTRICTED.includes(input.sensitivity) && !context.actor.permissions.has('note.write')) {
    throw forbidden('You cannot record a sensitive note.');
  }

  const student = await prisma.user.findFirst({
    where: { id: input.studentId, schoolId },
    select: { id: true },
  });
  if (!student) throw notFound('Student');

  const note = await prisma.teacherNote.create({
    data: {
      schoolId,
      authorId: context.actor.userId,
      studentId: input.studentId,
      kind: input.kind,
      visibility: input.visibility,
      sensitivity: input.sensitivity,
      title: input.title ?? null,
      body: input.body,
      followUpDueAt: input.followUpDueAt ?? null,
    },
    select: NOTE_SELECT,
  });

  recordAudit(context, {
    action: 'note.create',
    targetType: 'TeacherNote',
    targetId: note.id,
    schoolId,
    // The body is never copied into the audit trail; the label is enough to show
    // that a note of this kind was written about this learner.
    summary: `A ${input.sensitivity} ${input.kind} note was recorded.`,
    afterData: { visibility: input.visibility, sensitivity: input.sensitivity, kind: input.kind },
  });

  return note;
}

/**
 * Only the author edits a note's substance. A safeguarding lead may re-label its
 * visibility or sensitivity — that is a governance action, not an edit of someone
 * else's professional record — but not rewrite the body.
 */
export async function updateNote(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: UpdateNoteInput,
) {
  const existing = await prisma.teacherNote.findFirst({
    where: { id, schoolId },
    select: {
      id: true,
      authorId: true,
      studentId: true,
      kind: true,
      visibility: true,
      sensitivity: true,
      withdrawnAt: true,
      followUpDoneAt: true,
    },
  });
  if (!existing) throw notFound('Note');
  if (existing.withdrawnAt) throw conflict('That note has been withdrawn and can no longer be edited.');

  const isAuthor = existing.authorId === context.actor.userId;
  const isSafeguardingLead = context.actor.permissions.has('note.read.sensitive');
  if (!isAuthor && !isSafeguardingLead) throw forbidden('Only the author can edit that note.');
  if (!isAuthor && (input.body !== undefined || input.title !== undefined)) {
    throw forbidden('Only the author can change the content of a note.');
  }

  const sensitivity = input.sensitivity ?? existing.sensitivity;
  const visibility = input.visibility ?? existing.visibility;
  assertSafeguardingNotShared(sensitivity, visibility);

  const now = new Date();
  const note = await prisma.teacherNote.update({
    where: { id },
    data: {
      kind: input.kind ?? undefined,
      visibility: input.visibility ?? undefined,
      sensitivity: input.sensitivity ?? undefined,
      title: input.title ?? undefined,
      body: input.body ?? undefined,
      followUpDueAt: input.followUpDueAt ?? undefined,
      ...(input.followUpDone === undefined
        ? {}
        : { followUpDoneAt: input.followUpDone ? (existing.followUpDoneAt ?? now) : null }),
    },
    select: NOTE_SELECT,
  });

  recordAudit(context, {
    action: 'note.update',
    targetType: 'TeacherNote',
    targetId: id,
    schoolId,
    summary: isAuthor ? 'The author revised a note.' : 'A note was re-labelled by the safeguarding lead.',
    beforeData: { visibility: existing.visibility, sensitivity: existing.sensitivity, kind: existing.kind },
    afterData: { visibility: note.visibility, sensitivity: note.sensitivity, kind: note.kind },
  });

  return note;
}

/** Blueprint 04: notes are never hard-deleted; they are withdrawn with a reason. */
export async function withdrawNote(
  context: ActorContext,
  schoolId: string,
  id: string,
  reason: string,
) {
  const existing = await prisma.teacherNote.findFirst({
    where: { id, schoolId },
    select: { id: true, authorId: true, withdrawnAt: true, sensitivity: true },
  });
  if (!existing) throw notFound('Note');
  if (existing.withdrawnAt) throw conflict('That note has already been withdrawn.');

  const isAuthor = existing.authorId === context.actor.userId;
  if (!isAuthor && !context.actor.permissions.has('note.read.sensitive')) {
    throw forbidden('Only the author can withdraw that note.');
  }

  const note = await prisma.teacherNote.update({
    where: { id },
    data: {
      withdrawnAt: new Date(),
      withdrawnById: context.actor.userId,
      withdrawReason: reason,
    },
    select: NOTE_SELECT,
  });

  recordAudit(context, {
    action: 'note.withdraw',
    targetType: 'TeacherNote',
    targetId: id,
    schoolId,
    summary: 'A note was withdrawn.',
    reason,
    afterData: { sensitivity: existing.sensitivity },
  });

  return note;
}

/**
 * Blueprint 04: "Safeguarding notes are escalated rather than shared." Escalation
 * names the person taking the concern on, so responsibility is explicit, and closes
 * off parent visibility for good.
 */
export async function escalateNote(
  context: ActorContext,
  schoolId: string,
  id: string,
  input: EscalateNoteInput,
) {
  const existing = await prisma.teacherNote.findFirst({
    where: { id, schoolId },
    select: { id: true, authorId: true, escalatedAt: true, sensitivity: true, visibility: true },
  });
  if (!existing) throw notFound('Note');
  if (existing.escalatedAt) throw conflict('That note has already been escalated.');

  const recipient = await prisma.user.findFirst({
    where: { id: input.escalatedToId, schoolId },
    select: { id: true, primaryRole: true },
  });
  if (!recipient) throw notFound('Recipient');
  if (recipient.primaryRole === 'STUDENT' || recipient.primaryRole === 'PARENT') {
    throw badRequest('A note can only be escalated to a member of staff.');
  }

  const note = await prisma.teacherNote.update({
    where: { id },
    data: {
      escalatedAt: new Date(),
      escalatedToId: input.escalatedToId,
      // Escalating states the concern is serious; the label follows.
      sensitivity:
        existing.sensitivity === NoteSensitivity.ROUTINE
          ? NoteSensitivity.SENSITIVE
          : existing.sensitivity,
      visibility:
        existing.visibility === NoteVisibility.PARENT_VISIBLE
          ? NoteVisibility.AUTHORIZED_STAFF
          : existing.visibility,
    },
    select: NOTE_SELECT,
  });

  recordAudit(context, {
    action: 'note.escalate',
    targetType: 'TeacherNote',
    targetId: id,
    schoolId,
    summary: 'A note was escalated to a member of staff.',
    reason: input.note ?? null,
    beforeData: { sensitivity: existing.sensitivity, visibility: existing.visibility },
    afterData: {
      sensitivity: note.sensitivity,
      visibility: note.visibility,
      escalatedToId: input.escalatedToId,
    },
  });

  return note;
}
