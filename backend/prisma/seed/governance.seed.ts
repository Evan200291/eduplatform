// ─────────────────────────────────────────────────────────────────────────────
// Seed — content ownership and publication history
// Blueprint 05 "Ownership labels" and blueprint 10 legal position: for every
// content object the school must be able to answer "who owns this, under what
// licence, and may we share it?" without reading a contract.
//
// This module is the authority for ownership labels. The curriculum, lesson and
// activity writers set `ownership` only when they create a row, never on update,
// so the label written here survives a re-seed. It runs after those modules for
// that reason.
//
// The demo deliberately spans all five labels, because a school that only ever
// sees MIDAS_ORIGINAL cannot tell whether the feature works:
//
//   MIDAS_ORIGINAL       maths years 3 and 4 — authored for the platform
//   CO_CREATED           maths year 5 — written with the school's specialist
//   SCHOOL_LICENSED      english — licensed from the trust
//   THIRD_PARTY_LICENSED science — licensed from a publisher, expires
//   SCHOOL_OWNED         teacher-written extensions, logo, parent letter
// ─────────────────────────────────────────────────────────────────────────────

import { ContentOwnership, ContentStatus } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import type { ContentFixture } from './content.seed';
import type { CurriculumFixture } from './curriculum.seed';
import { daysAgo, daysAhead, log, step } from './helpers';
import type { MediaFixture } from './media.seed';
import type { SchoolFixture } from './school.seed';

export interface GovernanceFixture {
  ownershipRecords: number;
  publications: number;
  /** Publications still awaiting a decision, for the review queue. */
  pendingPublications: number;
}

/** The licence position for one content object. */
interface OwnershipSpec {
  ownership: ContentOwnership;
  licenseHolder: string | null;
  licenseReference: string | null;
  /** Licence window in days either side of "now". Null for owned content. */
  windowDays: readonly [startedDaysAgo: number, endsInDays: number] | null;
  canRedistribute: boolean;
  notes: string;
}

const PLATFORM_AUTHORED: OwnershipSpec = {
  ownership: ContentOwnership.MIDAS_ORIGINAL,
  licenseHolder: 'Midas Learning Cloud',
  licenseReference: null,
  windowDays: null,
  canRedistribute: false,
  notes: 'Authored for the platform. The school may use it for as long as the subscription runs.',
};

const CO_CREATED: OwnershipSpec = {
  ownership: ContentOwnership.CO_CREATED,
  licenseHolder: 'Midas Learning Cloud and Riverbank Primary School',
  licenseReference: 'CO-2026-Y5-MATHS',
  windowDays: null,
  canRedistribute: false,
  notes: 'Written with the school mathematics specialist. Neither party may redistribute alone.',
};

const TRUST_LICENSED: OwnershipSpec = {
  ownership: ContentOwnership.SCHOOL_LICENSED,
  licenseHolder: 'Riverbank Multi-Academy Trust',
  licenseReference: 'RMAT-ENG-2026',
  windowDays: [210, 520],
  canRedistribute: true,
  notes: 'Licensed from the trust. May be shared with other schools inside the trust only.',
};

const PUBLISHER_LICENSED: OwnershipSpec = {
  ownership: ContentOwnership.THIRD_PARTY_LICENSED,
  licenseHolder: 'Northwind Science Press',
  licenseReference: 'NSP-2026-114',
  windowDays: [300, 430],
  canRedistribute: false,
  notes: 'Licensed from the publisher. Redistribution is not permitted and the licence expires.',
};

const SCHOOL_OWNED: OwnershipSpec = {
  ownership: ContentOwnership.SCHOOL_OWNED,
  licenseHolder: 'Riverbank Primary School',
  licenseReference: null,
  windowDays: null,
  canRedistribute: true,
  notes: 'Created by school staff. The school owns it and may share it as it wishes.',
};

/** Program key prefix decides the licence position of everything inside it. */
function specForProgram(programKey: string): OwnershipSpec {
  if (programKey.startsWith('science-')) return PUBLISHER_LICENSED;
  if (programKey.startsWith('english-')) return TRUST_LICENSED;
  if (programKey === 'maths-y5') return CO_CREATED;
  return PLATFORM_AUTHORED;
}

/** Writes the evidence row. Unique on `[targetType, targetId]`, so it upserts. */
async function upsertOwnership(
  targetType: string,
  targetId: string,
  spec: OwnershipSpec,
  context: { schoolId: string; createdById: string; now: Date },
): Promise<void> {
  const columns = {
    ownership: spec.ownership,
    licenseHolder: spec.licenseHolder,
    licenseReference: spec.licenseReference,
    licenseStartsAt: spec.windowDays ? daysAgo(spec.windowDays[0], context.now) : null,
    licenseEndsAt: spec.windowDays ? daysAhead(spec.windowDays[1], context.now) : null,
    canRedistribute: spec.canRedistribute,
    notes: spec.notes,
  };

  await prisma.contentOwnershipRecord.upsert({
    where: { targetType_targetId: { targetType, targetId } },
    update: columns,
    create: { ...columns, targetType, targetId, schoolId: context.schoolId, createdById: context.createdById },
    select: { id: true },
  });
}

/**
 * Publications have no natural unique key — the same object is published many
 * times — so a row is located by its target and version number.
 */
async function upsertPublication(
  target: { lessonId?: string; activityId?: string },
  version: number,
  columns: {
    status: ContentStatus;
    changeSummary: string;
    reviewNotes: string | null;
    effectiveFrom: Date;
    publishedAt: Date | null;
    retiredAt: Date | null;
  },
  context: { schoolId: string; reviewedById: string; publishedById: string },
): Promise<void> {
  const where = {
    version,
    lessonId: target.lessonId ?? null,
    activityId: target.activityId ?? null,
  };
  const existing = await prisma.contentPublication.findFirst({ where, select: { id: true } });
  const data = {
    ...columns,
    reviewedById: context.reviewedById,
    publishedById: columns.publishedAt ? context.publishedById : null,
  };

  if (existing) {
    await prisma.contentPublication.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.contentPublication.create({ data: { ...data, ...where, schoolId: context.schoolId } });
}

/** Ownership records and licence labels for the whole content tree. */
async function labelContent(
  curriculum: CurriculumFixture,
  content: ContentFixture,
  media: MediaFixture,
  context: { schoolId: string; createdById: string; now: Date },
): Promise<number> {
  let written = 0;

  for (const [programKey, programId] of Object.entries(curriculum.programIds)) {
    const spec = specForProgram(programKey);
    await prisma.curriculumProgram.update({ where: { id: programId }, data: { ownership: spec.ownership } });
    await upsertOwnership('CURRICULUM_PROGRAM', programId, spec, context);
    written += 1;
  }

  for (const [index, topic] of curriculum.topics.entries()) {
    const spec = specForProgram(topic.programKey);

    const lesson = content.lessonByTopic[topic.id];
    if (lesson) {
      await prisma.lesson.update({ where: { id: lesson.id }, data: { ownership: spec.ownership } });
      await upsertOwnership('LESSON', lesson.id, spec, context);
      written += 1;
    }

    for (const activity of content.activities.filter((candidate) => candidate.topicId === topic.id)) {
      // Every fourth topic has its extension activity written by the class
      // teacher rather than supplied, which is the common real-world case.
      const owned = activity.key === 'extend' && index % 4 === 1;
      const activitySpec = owned ? SCHOOL_OWNED : spec;
      await prisma.activity.update({ where: { id: activity.id }, data: { ownership: activitySpec.ownership } });
      await upsertOwnership('ACTIVITY', activity.id, activitySpec, context);
      written += 1;
    }
  }

  const assets: [id: string, spec: OwnershipSpec][] = [
    ...Object.values(media.subjectBannerIds).map((id) => [id, PLATFORM_AUTHORED] as [string, OwnershipSpec]),
    [media.logoId, SCHOOL_OWNED],
    [media.parentLetterId, SCHOOL_OWNED],
  ];

  for (const [id, spec] of assets) {
    await prisma.mediaAsset.update({
      where: { id },
      data: {
        ownership: spec.ownership,
        licenseNote: spec.notes,
        attribution: spec.licenseHolder,
      },
    });
    await upsertOwnership('MEDIA', id, spec, context);
    written += 1;
  }

  return written;
}

/**
 * Publication history. Lessons at every ninth topic carry a retired version 1
 * and a live version 2, so the "publication is reversible and versioned" claim
 * in blueprint 05 has evidence behind it on a fresh install.
 */
async function recordPublications(
  curriculum: CurriculumFixture,
  content: ContentFixture,
  context: { schoolId: string; reviewedById: string; publishedById: string; now: Date },
): Promise<{ published: number; pending: number }> {
  let published = 0;
  let pending = 0;

  for (const [index, topic] of curriculum.topics.entries()) {
    const lesson = content.lessonByTopic[topic.id];

    if (lesson) {
      const revised = index % 9 === 2;
      const reissuedAt = daysAgo(14, context.now);

      await upsertPublication(
        { lessonId: lesson.id },
        1,
        {
          status: revised ? ContentStatus.REVISED : ContentStatus.PUBLISHED,
          changeSummary: 'First publication of the lesson and its sections.',
          reviewNotes: 'Read for accuracy, reading age and accessibility of the alt text.',
          effectiveFrom: lesson.publishedAt,
          publishedAt: lesson.publishedAt,
          retiredAt: revised ? reissuedAt : null,
        },
        context,
      );
      published += 1;

      if (revised) {
        await prisma.lesson.update({ where: { id: lesson.id }, data: { version: 2 } });
        await upsertPublication(
          { lessonId: lesson.id },
          2,
          {
            status: ContentStatus.PUBLISHED,
            changeSummary: 'Reworked the worked example after teacher feedback; added a second model answer.',
            reviewNotes: 'Approved. Change is pedagogical only, so no re-consent was needed.',
            effectiveFrom: reissuedAt,
            publishedAt: reissuedAt,
            retiredAt: null,
          },
          context,
        );
        published += 1;
      }
    }

    for (const activity of content.activities.filter((candidate) => candidate.topicId === topic.id)) {
      // A draft has never been submitted, so it has no publication row at all.
      if (activity.status === ContentStatus.DRAFT) continue;

      const awaiting = activity.status !== ContentStatus.PUBLISHED;
      await upsertPublication(
        { activityId: activity.id },
        activity.version,
        {
          status: awaiting ? ContentStatus.IN_REVIEW : ContentStatus.PUBLISHED,
          changeSummary: awaiting
            ? 'Submitted for review. Waiting on a curriculum lead to check the answer key.'
            : 'First publication of the activity and its questions.',
          reviewNotes: awaiting ? null : 'Answer key checked question by question.',
          effectiveFrom: activity.publishedAt ?? daysAgo(7, context.now),
          publishedAt: activity.publishedAt,
          retiredAt: null,
        },
        context,
      );

      if (awaiting) pending += 1;
      else published += 1;
    }
  }

  return { published, pending };
}

export async function seedGovernance(
  fixture: SchoolFixture,
  curriculum: CurriculumFixture,
  content: ContentFixture,
  media: MediaFixture,
  actors: { adminId: string; curriculumManagerId: string },
  now: Date,
): Promise<GovernanceFixture> {
  step('Content ownership and publication history (blueprint 05, 10)');

  const ownershipRecords = await labelContent(curriculum, content, media, {
    schoolId: fixture.schoolId,
    createdById: actors.curriculumManagerId,
    now,
  });

  const { published, pending } = await recordPublications(curriculum, content, {
    schoolId: fixture.schoolId,
    reviewedById: actors.curriculumManagerId,
    publishedById: actors.adminId,
    now,
  });

  const labels = await prisma.contentOwnershipRecord.groupBy({
    by: ['ownership'],
    where: { schoolId: fixture.schoolId },
    _count: { _all: true },
  });

  log(`${ownershipRecords} ownership records`);
  log(
    `by label: ${labels
      .map((row) => `${row.ownership} ${row._count._all}`)
      .sort()
      .join(', ')}`,
  );
  log(`${published} publications live or retired, ${pending} awaiting review`);

  return { ownershipRecords, publications: published, pendingPublications: pending };
}
