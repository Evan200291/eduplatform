// ─────────────────────────────────────────────────────────────────────────────
// Seed entry point
// `npm run db:seed`, and what `prisma migrate reset` runs after it rebuilds the
// schema. Two jobs, in this order:
//
//   1. Bootstrap. The rows a *production* install needs before anybody can log
//      in: the platform owner, the feature registry, platform settings, the
//      retention defaults, the report catalogue and the six base themes. These
//      run every time, on every environment.
//   2. Demo tenant. A school with staff, learners, curriculum, content,
//      assessments, attempts, mastery and learning paths — the data the
//      dashboards in the blueprint are drawn against. Gated on `SEED_DEMO_DATA`,
//      so a real deployment sets it to `false` and gets step 1 only.
//
// Order below is dependency order, not preference: content needs curriculum and
// media, questions need content, attempts need questions and assessments,
// mastery needs attempts, learning paths need mastery. Each `seed*` function
// returns a fixture describing what it wrote, and later steps read ids out of
// those fixtures rather than re-querying, which is also why this file is a
// straight line of `await`s and not a `Promise.all`.
//
// Every step is idempotent (see prisma/seed/helpers.ts), so running this twice
// leaves the same database and nothing is ever deleted. That matters more than
// speed here: `db:seed` on a VPS gets run again after a schema change, and a
// seed that duplicated its rows would be worse than no seed at all.
//
// Deliberately not seeded: `Session`. Sessions are refresh-token records with a
// hashed secret and a real expiry, minted by the login route. A seeded one is
// either a credential nobody can use or, worse, a credential somebody can —
// so the demo signs in like anyone else and gets a real session.
//
// Still to be wired in (owned by the other agent on this codebase, and not on
// disk yet): teacher workspace, communications and ops. Their call sites are
// marked at the bottom of `seedDemoTenant` so adding each one is a single line
// in dependency order.
// ─────────────────────────────────────────────────────────────────────────────

import { env } from '../src/config/env';
import { disconnectDatabase } from '../src/core/prisma';

import { seedAssessments } from './seed/assessment.seed';
import { seedAssignments } from './seed/assignment.seed';
import { seedAttempts } from './seed/attempts.seed';
import { resnapshotActivities, seedContent } from './seed/content.seed';
import { seedCurriculum } from './seed/curriculum.seed';
import { seedEngagement } from './seed/engagement.seed';
import { seedEvaluations } from './seed/evaluation.seed';
import { seedGovernance } from './seed/governance.seed';
import { log, step } from './seed/helpers';
import { seedLearning } from './seed/learning.seed';
import { seedDemoMedia } from './seed/media.seed';
import { seedModeration } from './seed/moderation.seed';
import { seedDemoPeople } from './seed/people.seed';
import {
  seedFeatureRegistry,
  seedPlatformSettings,
  seedReportCatalogue,
  seedRetentionPolicies,
} from './seed/platform.seed';
import { seedQuestions } from './seed/question.seed';
import { seedDemoSchool } from './seed/school.seed';
import { seedBaseThemes } from './seed/theme.seed';
import { seedPlatformOwner } from './seed/owner.seed';

/**
 * Rows a real install needs. No demo content, no tenant — just the platform
 * itself: an owner who can sign in, the feature flags the API reads on every
 * request, the settings and retention defaults the admin panel edits, the report
 * catalogue, and the themes a new school picks a starting point from.
 *
 * Returns the owner's id, which the demo tenant uses as the platform-side
 * escalation target for moderation.
 */
async function seedPlatform(now: Date): Promise<string> {
  const ownerId = await seedPlatformOwner(now);

  // `syncFeatureDefinitions` is the same call the API makes at boot, so the
  // registry here is generated from the code rather than restated in the seed.
  await seedFeatureRegistry();
  await seedPlatformSettings();
  await seedRetentionPolicies();
  await seedReportCatalogue();
  await seedBaseThemes(now);

  return ownerId;
}

/**
 * The demo school, built in dependency order. Each step logs its own heading, so
 * the only thing this function adds is the wiring and one closing summary.
 */
async function seedDemoTenant(ownerId: string, now: Date): Promise<void> {
  const school = await seedDemoSchool(now);
  const people = await seedDemoPeople(school, now);

  // Media before content: lessons use the subject banners as hero images and
  // activities use them as thumbnails, so the ids have to exist first.
  const media = await seedDemoMedia(school, people, now);

  const curriculum = await seedCurriculum(school, people.curriculumManagerId, now);
  const content = await seedContent(school, curriculum, media, people.curriculumManagerId, now);
  const questions = await seedQuestions(curriculum, content);

  // Content versions were snapshotted before their questions existed (an
  // activity has to exist before a question can reference it) — refresh them
  // now so the assessment engine has a real answer key to mark against.
  await resnapshotActivities(content);

  const assessments = await seedAssessments(
    school,
    curriculum,
    content,
    people.curriculumManagerId,
    now,
  );

  // Governance and moderation describe the same content from two angles —
  // who owns it and who complained about it — so both come after content and
  // before anything a learner did with it.
  const governance = await seedGovernance(
    school,
    curriculum,
    content,
    media,
    people,
    now,
  );
  const moderation = await seedModeration(school, curriculum, content, people, ownerId, now);

  // The evidence chain. Attempts produce responses, responses produce topic
  // evaluations and mastery, mastery produces a learning path. Nothing later in
  // this chain invents evidence the step before it did not record.
  const attempts = await seedAttempts(
    school,
    people,
    curriculum,
    content,
    questions,
    assessments,
    now,
  );
  const evaluation = await seedEvaluations(
    school,
    people,
    curriculum,
    content,
    questions,
    attempts,
    now,
  );
  const learning = await seedLearning(
    school,
    people,
    curriculum,
    content,
    assessments,
    attempts,
    evaluation,
    now,
  );

  // Assignments come after attempts because the monitor board links a learner's
  // assignment to the assessment evidence they actually produced.
  const assignments = await seedAssignments(
    school,
    people,
    curriculum,
    content,
    assessments,
    attempts,
    now,
  );

  const engagement = await seedEngagement(school, people, content, attempts, assignments, now);

  // ── Not yet on disk. Add each in this order as it lands: ──────────────────
  // const teacher     = await seedTeacherWorkspace(school, people, curriculum, evaluation, now);
  // const comms       = await seedComms(school, people, assignments, now);
  // await seedOps(school, people, now);

  step('Demo tenant summary');
  log(`${people.students.length} learners, ${people.teacherIds.length} teachers`);
  log(`${curriculum.topics.length} topics, ${content.lessons.length} lessons, ${content.activities.length} activities`);
  log(`${questions.questions.length} questions across ${assessments.assessments.length} assessments`);
  log(`${attempts.attempts.length} attempts, ${attempts.responses} responses`);
  log(`${evaluation.topicMastery.length} mastery records, ${evaluation.progressRecords} progress records`);
  log(`${learning.paths} learning paths, ${learning.pathItems} steps, ${learning.recommendations} recommendations`);
  log(`${assignments.assignments.length} assignments, ${assignments.attempts.length} learner attempts (${assignments.overdue.length} overdue)`);
  log(`${governance.publications} publications (${governance.pendingPublications} pending), ${moderation.reportIds.length} reports (${moderation.openReports} open)`);
  log(`${engagement.pointsEntries} points entries, ${engagement.badgesAwarded} badges awarded, ${engagement.streakUpdates} streak updates`);
  log(`${engagement.companions} companions, ${engagement.rewardsGranted} rewards unlocked, ${engagement.missionProgress} mission progress rows (${engagement.missionsCompleted} completed)`);
}

async function main(): Promise<void> {
  // One clock for the whole run. Every module derives its timestamps from this,
  // so "3 days ago" means the same instant in the attempt history as it does in
  // the learning path built from that attempt.
  const now = new Date();
  const startedAt = Date.now();

  console.log('Midas Learning Cloud — database seed');

  const ownerId = await seedPlatform(now);

  if (env.bootstrap.seedDemoData) {
    await seedDemoTenant(ownerId, now);
  } else {
    step('Demo data');
    log('SEED_DEMO_DATA is false — platform bootstrap only.');
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${seconds}s. Sign in as ${env.bootstrap.ownerEmail}.\n`);
}

main()
  .catch((error: unknown) => {
    // A seed that half-ran is a real state somebody has to debug, so the failure
    // is printed in full rather than summarised, and the exit code is non-zero so
    // `prisma migrate reset` and any deploy script stop here.
    console.error('\nSeed failed:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // The seed modules share the client singleton from src/core/prisma; without
    // an explicit disconnect the process hangs on an open connection pool.
    await disconnectDatabase();
  });
