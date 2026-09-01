// ─────────────────────────────────────────────────────────────────────────────
// Consent and lawful basis
// Blueprint 10: "record the lawful basis relied on for each processing purpose, per
// school, with the evidence of who confirmed it and when."
//
// Consent records are append-only. Changing a basis writes a new row and withdraws
// the old one; nothing is edited in place. That is the difference between a consent
// register and a settings screen: the register can answer "what were we relying on
// last March?", and a settings screen cannot answer it at all.
//
// Two levels, deliberately: a school-level row records the basis the school relies
// on for everybody, and a learner-level row overrides it for one child. Most purposes
// only ever have the school-level row. `effectiveBasis` resolves the two in the one
// place, so no caller has to remember which wins.
//
// `hasLawfulBasis` is available to any module that wants to gate a feature on this
// register. Today it is read by the privacy screens and by nothing else — the
// register records what the school decided; it does not silently switch features off,
// because a learner losing their companion mid-term with no explanation is not a
// privacy improvement.
// ─────────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';
import { recordAudit } from '../../core/audit/audit.service';
import type { ActorContext } from '../../core/context';
import { conflict, notFound } from '../../core/http/errors';
import { toSkipTake } from '../../core/http/pagination';
import { prisma } from '../../core/prisma';
import type { z } from 'zod';
import type { LawfulBasis } from './privacy.validation';
import type {
  consentListQuery,
  recordConsentSchema,
  withdrawConsentSchema,
} from './privacy.validation';

type RecordInput = z.infer<typeof recordConsentSchema>;
type WithdrawInput = z.infer<typeof withdrawConsentSchema>;
type ListQuery = z.infer<typeof consentListQuery>;

/**
 * The purposes the platform actually processes data for. Free text is still accepted
 * — a school may have a purpose we have not thought of — but these are the ones the
 * product itself relies on, and a privacy screen shows them whether or not the school
 * has recorded a basis, because an unrecorded purpose is the gap worth surfacing.
 */
export interface ProcessingPurpose {
  purpose: string;
  label: string;
  description: string;
  /** What most schools rely on for this, as a starting point rather than advice. */
  suggestedBasis: LawfulBasis;
  /** True where the platform can operate with this purpose switched off. */
  optional: boolean;
}

export const PROCESSING_PURPOSES: ProcessingPurpose[] = [
  {
    purpose: 'core_education_delivery',
    label: 'Delivering lessons and activities',
    description:
      'Storing who a learner is, what they were set, and what they submitted. Without this there is no platform, which is why it is a contractual necessity rather than a choice.',
    suggestedBasis: 'CONTRACT',
    optional: false,
  },
  {
    purpose: 'learning_analytics',
    label: 'Progress and mastery analysis',
    description:
      'Turning answers into progress and mastery figures, and into the reports teachers read. This is the processing that makes the platform useful to a teacher rather than just a delivery mechanism.',
    suggestedBasis: 'LEGITIMATE_INTEREST',
    optional: false,
  },
  {
    purpose: 'adaptive_recommendations',
    label: 'Adaptive recommendations',
    description:
      "Using a learner's history to suggest what they should do next. Suggestions are proposed to a teacher rather than applied automatically, which is what keeps this proportionate.",
    suggestedBasis: 'LEGITIMATE_INTEREST',
    optional: true,
  },
  {
    purpose: 'engagement_features',
    label: 'Points, badges and streaks',
    description:
      'Motivational features that record what a learner did and when. Visible to the learner and their teacher only.',
    suggestedBasis: 'LEGITIMATE_INTEREST',
    optional: true,
  },
  {
    purpose: 'leaderboards',
    label: 'Leaderboards',
    description:
      "Showing a learner's standing next to their classmates. Off by default at platform level, opt-outable by the learner, and the one engagement feature that publishes a comparison between children.",
    suggestedBasis: 'CONSENT',
    optional: true,
  },
  {
    purpose: 'parent_communication',
    label: 'Communicating with parents',
    description:
      'Sending a parent or carer information about their own child: progress summaries, homework reminders, safeguarding follow-ups.',
    suggestedBasis: 'CONTRACT',
    optional: false,
  },
  {
    purpose: 'media_publication',
    label: 'Publishing learner work or images',
    description:
      "Using a learner's work, name or photograph anywhere it can be seen outside their class. Consent is the only sound basis, and it is per child.",
    suggestedBasis: 'CONSENT',
    optional: true,
  },
  {
    purpose: 'marketing_communication',
    label: 'Marketing to school staff',
    description:
      'Telling staff about features and offers. Never applies to learners, and never uses learner data.',
    suggestedBasis: 'CONSENT',
    optional: true,
  },
  {
    purpose: 'support_diagnostics',
    label: 'Support and diagnostics',
    description:
      'Reading logs and, with permission, acting inside a school to resolve a support ticket. Every impersonated action is audited as impersonation.',
    suggestedBasis: 'LEGITIMATE_INTEREST',
    optional: false,
  },
  {
    purpose: 'safeguarding_records',
    label: 'Safeguarding notes',
    description:
      'Recording and escalating a concern about a child. Retained longer than anything else on the platform, and never used for analytics.',
    suggestedBasis: 'LEGAL_OBLIGATION',
    optional: false,
  },
];

const CONSENT_SELECT = {
  id: true,
  schoolId: true,
  userId: true,
  purpose: true,
  lawfulBasis: true,
  granted: true,
  confirmedById: true,
  evidenceNote: true,
  policyVersion: true,
  effectiveFrom: true,
  withdrawnAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ConsentRecordSelect;

export type ConsentRow = Prisma.ConsentRecordGetPayload<{ select: typeof CONSENT_SELECT }>;

/** A row is live when it has not been withdrawn and its start date has passed. */
function liveFilter(now: Date): Prisma.ConsentRecordWhereInput {
  return { withdrawnAt: null, effectiveFrom: { lte: now } };
}

// ── Recording ───────────────────────────────────────────────────────────────

/**
 * Records a basis. Any live row for the same school, purpose and subject is
 * withdrawn in the same transaction, so "current" is never ambiguous and the
 * previous decision is still readable.
 */
export async function recordConsent(
  context: ActorContext,
  schoolId: string,
  input: RecordInput,
  now = new Date(),
): Promise<ConsentRow> {
  if (input.userId) {
    const subject = await prisma.user.findFirst({
      where: { id: input.userId, schoolId },
      select: { id: true },
    });
    if (!subject) throw notFound('Subject');
  }

  const row = await prisma.$transaction(async (tx) => {
    await tx.consentRecord.updateMany({
      where: {
        schoolId,
        purpose: input.purpose,
        userId: input.userId ?? null,
        ...liveFilter(now),
      },
      data: { withdrawnAt: now },
    });

    return tx.consentRecord.create({
      data: {
        schoolId,
        userId: input.userId ?? null,
        purpose: input.purpose,
        lawfulBasis: input.lawfulBasis,
        granted: input.granted,
        confirmedById: context.actor.userId,
        evidenceNote: input.evidenceNote ?? null,
        policyVersion: input.policyVersion ?? null,
        effectiveFrom: input.effectiveFrom ?? now,
      },
      select: CONSENT_SELECT,
    });
  });

  recordAudit(context, {
    action: 'consent.record',
    targetType: 'ConsentRecord',
    targetId: row.id,
    schoolId,
    summary: `${input.granted ? 'Recorded' : 'Refused'} ${input.purpose} on the basis of ${input.lawfulBasis}${input.userId ? ' for one learner' : ' school-wide'}`,
    afterData: row,
  });
  return row;
}

/**
 * Withdrawal. The row is closed with a date rather than deleted, because "we used to
 * rely on consent and it was withdrawn on the 4th" is exactly the fact a register
 * exists to hold.
 */
export async function withdrawConsent(
  context: ActorContext,
  schoolId: string,
  consentId: string,
  input: WithdrawInput,
  now = new Date(),
): Promise<ConsentRow> {
  const existing = await prisma.consentRecord.findFirst({
    where: { id: consentId, schoolId },
    select: CONSENT_SELECT,
  });
  if (!existing) throw notFound('Consent record');
  if (existing.withdrawnAt) throw conflict('This record was already withdrawn.');

  const row = await prisma.consentRecord.update({
    where: { id: existing.id },
    data: {
      withdrawnAt: now,
      evidenceNote: input.evidenceNote ?? existing.evidenceNote,
    },
    select: CONSENT_SELECT,
  });

  recordAudit(context, {
    action: 'consent.record',
    targetType: 'ConsentRecord',
    targetId: row.id,
    schoolId,
    summary: `Withdrew ${existing.purpose}${existing.userId ? ' for one learner' : ' school-wide'}`,
    beforeData: existing,
    afterData: row,
  });
  return row;
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listConsent(
  _context: ActorContext,
  schoolId: string,
  query: ListQuery,
  now = new Date(),
): Promise<{ items: ConsentRow[]; totalItems: number }> {
  const { skip, take } = toSkipTake(query);
  const where: Prisma.ConsentRecordWhereInput = {
    schoolId,
    ...(query.purpose ? { purpose: query.purpose } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.schoolLevelOnly ? { userId: null } : {}),
    ...(query.activeOnly ? liveFilter(now) : {}),
    ...(query.search ? { purpose: { contains: query.search } } : {}),
  };

  const [items, totalItems] = await Promise.all([
    prisma.consentRecord.findMany({
      where,
      select: CONSENT_SELECT,
      orderBy: [{ purpose: 'asc' }, { effectiveFrom: 'desc' }],
      skip,
      take,
    }),
    prisma.consentRecord.count({ where }),
  ]);
  return { items, totalItems };
}

/**
 * The learner-level row wins where one exists; otherwise the school-level row. Null
 * means the school has not recorded anything for this purpose, which is different
 * from having recorded a refusal — and the caller is told which.
 */
export async function effectiveBasis(
  schoolId: string,
  purpose: string,
  userId?: string,
  now = new Date(),
): Promise<{ basis: LawfulBasis | null; granted: boolean | null; level: 'LEARNER' | 'SCHOOL' | 'NONE'; recordedAt: Date | null }> {
  if (userId) {
    const learner = await prisma.consentRecord.findFirst({
      where: { schoolId, purpose, userId, ...liveFilter(now) },
      select: CONSENT_SELECT,
      orderBy: { effectiveFrom: 'desc' },
    });
    if (learner) {
      return {
        basis: learner.lawfulBasis as LawfulBasis,
        granted: learner.granted,
        level: 'LEARNER',
        recordedAt: learner.effectiveFrom,
      };
    }
  }

  const school = await prisma.consentRecord.findFirst({
    where: { schoolId, purpose, userId: null, ...liveFilter(now) },
    select: CONSENT_SELECT,
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!school) return { basis: null, granted: null, level: 'NONE', recordedAt: null };
  return {
    basis: school.lawfulBasis as LawfulBasis,
    granted: school.granted,
    level: 'SCHOOL',
    recordedAt: school.effectiveFrom,
  };
}

/**
 * A yes/no for a feature gate. An unrecorded purpose returns the fallback rather than
 * a hard no: a school that has not finished filling in its register should not find
 * lessons switched off, and the register screen is where that gap is chased.
 */
export async function hasLawfulBasis(
  schoolId: string,
  purpose: string,
  userId?: string,
  fallbackWhenUnrecorded = true,
): Promise<boolean> {
  const current = await effectiveBasis(schoolId, purpose, userId);
  if (current.level === 'NONE') return fallbackWhenUnrecorded;
  return current.granted === true;
}

/**
 * The register as a screen wants it: every purpose the platform processes for, with
 * what the school has recorded against it and the gaps left blank. Learner-level
 * override counts are included because a purpose with two hundred overrides is being
 * managed very differently from one with none.
 */
export async function consentRegister(
  schoolId: string,
  now = new Date(),
): Promise<
  Array<
    ProcessingPurpose & {
      recorded: { basis: LawfulBasis | null; granted: boolean | null; recordedAt: Date | null };
      learnerOverrides: number;
    }
  >
> {
  const [schoolRows, overrides] = await Promise.all([
    prisma.consentRecord.findMany({
      where: { schoolId, userId: null, ...liveFilter(now) },
      select: CONSENT_SELECT,
      orderBy: { effectiveFrom: 'desc' },
    }),
    prisma.consentRecord.groupBy({
      by: ['purpose'],
      where: { schoolId, userId: { not: null }, ...liveFilter(now) },
      _count: { _all: true },
      orderBy: { purpose: 'asc' },
    }),
  ]);

  const byPurpose = new Map<string, ConsentRow>();
  for (const row of schoolRows) if (!byPurpose.has(row.purpose)) byPurpose.set(row.purpose, row);
  const overrideCount = new Map(overrides.map((entry) => [entry.purpose, entry._count._all]));

  return PROCESSING_PURPOSES.map((purpose) => {
    const row = byPurpose.get(purpose.purpose);
    return {
      ...purpose,
      recorded: {
        basis: row ? (row.lawfulBasis as LawfulBasis) : null,
        granted: row ? row.granted : null,
        recordedAt: row ? row.effectiveFrom : null,
      },
      learnerOverrides: overrideCount.get(purpose.purpose) ?? 0,
    };
  });
}
