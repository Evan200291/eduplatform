// ─────────────────────────────────────────────────────────────────────────────
// Seed — questions, answer options and hints
// Blueprint 03 "Supported initial forms" and blueprint 12 evidence capture.
//
// Where the items go. Each topic has three activities (practice, quiz, extend)
// and a hand-written bank of three core questions plus, for some topics, one
// matching or sorting item:
//
//   practice → questions 1 and 2      rehearsal, hints expected
//   quiz     → questions 1, 2 and 3   the assessed set
//   extend   → question 3 onwards     the hardest item and any extra form
//
// Activities that are not interactive (EXPLANATION, WORKED_EXAMPLE) or that
// happen away from the screen (TEACHER_TASK) deliberately get no questions.
//
// Matching by position. `Question`, `AnswerOption` and `Hint` have no natural
// unique key — a question may legitimately repeat a prompt — so rows are located
// by `sortOrder` within their parent and updated in place. Re-running the seed
// therefore rewrites the same rows instead of duplicating them.
// ─────────────────────────────────────────────────────────────────────────────

import { ActivityType, DifficultyBand, Prisma, QuestionType } from '@prisma/client';

import { prisma } from '../../src/core/prisma';
import type { CurriculumFixture, SeededTopic } from './curriculum.seed';
import type { ContentFixture, SeededActivity } from './content.seed';
import { QUESTION_BANK } from './data/questions';
import type { QuestionSpec } from './data/questions.types';
import { log, step } from './helpers';

/** One written option row, enough to synthesize a response of any form. */
export interface SeededOption {
  id: string;
  /** True for the single right answer, and for every item of a matching or sorting set. */
  isCorrect: boolean;
  /** Matching partner, null for every other form. */
  matchKey: string | null;
}

/** Everything a later module needs to fabricate a believable student response. */
export interface SeededQuestion {
  id: string;
  activityId: string;
  topicId: string;
  type: QuestionType;
  sortOrder: number;
  pointsValue: number;
  difficultyBand: DifficultyBand;
  objectiveId: string | null;
  /** In presentation order. Empty for numeric, true/false and short text. */
  options: SeededOption[];
  correctNumeric: number | null;
  correctBoolean: boolean | null;
  /** SHORT_TEXT: the first accepted spelling. */
  correctText: string | null;
  hintIds: string[];
}


export interface QuestionFixture {
  questions: SeededQuestion[];
  /** Questions in `sortOrder` for one activity id. */
  byActivity: Record<string, SeededQuestion[]>;
  /** Topics in the curriculum that had no bank entry. Empty in a healthy build. */
  topicsWithoutQuestions: string[];
}

/** Forms that carry no on-screen items. */
const WITHOUT_ITEMS: readonly ActivityType[] = [
  ActivityType.EXPLANATION,
  ActivityType.WORKED_EXAMPLE,
  ActivityType.TEACHER_TASK,
];

/** Which bank entries an activity presents. See the header table. */
function specsForActivity(activity: SeededActivity, bank: readonly QuestionSpec[]): readonly QuestionSpec[] {
  if (WITHOUT_ITEMS.includes(activity.type)) return [];

  switch (activity.key) {
    case 'practice':
      return bank.slice(0, 2);
    case 'quiz':
      return bank.slice(0, 3);
    default:
      return bank.slice(2);
  }
}

/**
 * The answer-key columns for one spec. Only the column matching the question
 * type is populated; the rest are nulled so a re-seed cannot leave a stale key
 * behind after an item's type is corrected in the bank.
 */
function answerKey(spec: QuestionSpec): {
  correctNumeric: Prisma.Decimal | null;
  numericTolerance: Prisma.Decimal | null;
  correctBoolean: boolean | null;
  correctText: Prisma.InputJsonValue | typeof Prisma.DbNull;
} {
  return {
    correctNumeric: spec.numeric === undefined ? null : new Prisma.Decimal(spec.numeric),
    numericTolerance:
      spec.numeric === undefined ? null : new Prisma.Decimal(spec.tolerance ?? 0),
    correctBoolean: spec.boolean ?? null,
    correctText: spec.text ? [...spec.text] : Prisma.DbNull,
  };
}

/**
 * Structure the marker needs beyond the option rows: the matching pairs and the
 * correct sorting sequence. Null for every other form.
 */
function itemConfig(spec: QuestionSpec): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (spec.pairs) return { form: 'MATCHING', pairs: spec.pairs.map(([left, right]) => ({ left, right })) };
  if (spec.order) return { form: 'SORTING', items: [...spec.order] };
  return Prisma.DbNull;
}

/** `[label, isCorrect, feedback, matchKey]` rows in presentation order. */
type OptionRow = readonly [label: string, isCorrect: boolean, feedback: string | null, matchKey: string | null];

function optionRowsFor(spec: QuestionSpec): readonly OptionRow[] {
  if (spec.options) {
    return spec.options.map(([label, isCorrect, feedback]) => [label, isCorrect, feedback, null] as const);
  }

  // Matching: the left column is the label, its partner is the match key.
  if (spec.pairs) {
    return spec.pairs.map(([left, right]) => [left, true, null, right] as const);
  }

  // Sorting: every item belongs in the sequence, so all of them are "correct";
  // the answer key is the position, stored as `sortOrder`.
  if (spec.order) {
    return spec.order.map((item) => [item, true, null, null] as const);
  }

  return [];
}

/**
 * Writes the option rows for one question, matched on position, and reports the
 * ids a later module needs to fabricate a right or wrong response.
 *
 * Surplus rows are removed. These are seed-owned demo rows, and a stale fourth
 * option left on a question that now has three would present a broken item.
 */
async function upsertOptions(questionId: string, spec: QuestionSpec): Promise<SeededOption[]> {
  const rows = optionRowsFor(spec);
  const written: SeededOption[] = [];

  for (const [sortOrder, [label, isCorrect, feedback, matchKey]] of rows.entries()) {
    const columns = { label, isCorrect, feedback, matchKey };
    const existing = await prisma.answerOption.findFirst({
      where: { questionId, sortOrder },
      select: { id: true },
    });

    const id = existing
      ? (await prisma.answerOption.update({ where: { id: existing.id }, data: columns, select: { id: true } })).id
      : (await prisma.answerOption.create({ data: { ...columns, questionId, sortOrder }, select: { id: true } })).id;

    written.push({ id, isCorrect, matchKey });
  }

  await prisma.answerOption.deleteMany({ where: { questionId, sortOrder: { gte: rows.length } } });
  return written;
}


/**
 * One hint per question, free to reveal (`pointsCost: 0`). Blueprint 03 is
 * explicit that scaffolding is offered before the student is stuck and that
 * using it is recorded rather than punished, so the demo never prices a hint.
 */
async function upsertHints(questionId: string, spec: QuestionSpec): Promise<string[]> {
  const bodies = [spec.hint];
  const ids: string[] = [];

  for (const [sortOrder, body] of bodies.entries()) {
    const existing = await prisma.hint.findFirst({
      where: { questionId, sortOrder },
      select: { id: true },
    });

    ids.push(
      existing
        ? (await prisma.hint.update({ where: { id: existing.id }, data: { body, pointsCost: 0 }, select: { id: true } }))
            .id
        : (await prisma.hint.create({ data: { questionId, body, sortOrder, pointsCost: 0 }, select: { id: true } })).id,
    );
  }

  await prisma.hint.deleteMany({ where: { questionId, sortOrder: { gte: bodies.length } } });
  return ids;
}

/** Writes one question with its options and hint, then reports what it wrote. */
async function upsertQuestion(
  activity: SeededActivity,
  topic: SeededTopic,
  spec: QuestionSpec,
  sortOrder: number,
): Promise<SeededQuestion> {
  const objectiveId = topic.objectives[spec.objective]?.id ?? null;
  const pointsValue = spec.points ?? 1;
  const difficultyBand = spec.band ?? topic.band;
  const columns = {
    objectiveId,
    type: spec.type,
    prompt: spec.prompt,
    explanation: spec.explanation,
    config: itemConfig(spec),
    difficultyBand,
    pointsValue,
    ...answerKey(spec),
  };

  const existing = await prisma.question.findFirst({
    where: { activityId: activity.id, sortOrder },
    select: { id: true },
  });

  const id = existing
    ? (await prisma.question.update({ where: { id: existing.id }, data: columns, select: { id: true } })).id
    : (
        await prisma.question.create({
          data: { ...columns, activityId: activity.id, sortOrder },
          select: { id: true },
        })
      ).id;

  const options = await upsertOptions(id, spec);
  const hintIds = await upsertHints(id, spec);

  return {
    id,
    activityId: activity.id,
    topicId: topic.id,
    type: spec.type,
    sortOrder,
    pointsValue,
    difficultyBand,
    objectiveId,
    options,
    correctNumeric: spec.numeric ?? null,
    correctBoolean: spec.boolean ?? null,
    correctText: spec.text?.[0] ?? null,
    hintIds,
  };
}

export async function seedQuestions(
  curriculum: CurriculumFixture,
  content: ContentFixture,
): Promise<QuestionFixture> {
  step('Questions, options and hints (blueprint 03, 12)');

  const result: QuestionFixture = { questions: [], byActivity: {}, topicsWithoutQuestions: [] };
  const byForm = new Map<QuestionType, number>();

  for (const topic of curriculum.topics) {
    const bank = QUESTION_BANK[`${topic.programKey}:${topic.key}`] ?? [];
    if (bank.length === 0) {
      result.topicsWithoutQuestions.push(`${topic.programKey}:${topic.key}`);
      continue;
    }

    // Draft and in-review activities get items too: a moderator opening the
    // review queue has to see the content they are being asked to judge.
    for (const activity of content.activities.filter((candidate) => candidate.topicId === topic.id)) {
      const specs = specsForActivity(activity, bank);
      const written: SeededQuestion[] = [];

      for (const [sortOrder, spec] of specs.entries()) {
        const question = await upsertQuestion(activity, topic, spec, sortOrder);
        written.push(question);
        result.questions.push(question);
        byForm.set(spec.type, (byForm.get(spec.type) ?? 0) + 1);
      }

      await prisma.question.deleteMany({
        where: { activityId: activity.id, sortOrder: { gte: specs.length } },
      });
      if (written.length > 0) result.byActivity[activity.id] = written;
    }
  }

  const forms = [...byForm.entries()].sort(([a], [b]) => a.localeCompare(b));
  log(`${result.questions.length} questions across ${Object.keys(result.byActivity).length} activities`);
  log(`by form: ${forms.map(([form, count]) => `${form} ${count}`).join(', ')}`);
  if (result.topicsWithoutQuestions.length > 0) {
    log(`no bank entry for ${result.topicsWithoutQuestions.length} topic(s): ${result.topicsWithoutQuestions.join(', ')}`);
  }

  return result;
}
