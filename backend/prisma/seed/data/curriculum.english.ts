// ─────────────────────────────────────────────────────────────────────────────
// Curriculum data — English, Years 3 to 5
// Same shape as the Mathematics table: reading first, then writing, so the demo
// learning paths alternate between comprehension and composition.
// ─────────────────────────────────────────────────────────────────────────────

import { DifficultyBand } from '@prisma/client';

import type { ProgramSpec } from './curriculum.types';

const YEAR_3: ProgramSpec = {
  subjectKey: 'english',
  gradeKey: 'year-3',
  key: 'english-y3',
  name: 'English — Year 3',
  framework: 'England KS2 English',
  description: 'Retrieval and inference in reading, and the sentence as a unit in writing.',
  units: [
    {
      key: 'reading-comprehension',
      name: 'Reading comprehension',
      description: 'Finding what a text says and what it implies.',
      topics: [
        {
          key: 'retrieval-and-inference',
          name: 'Retrieval and inference',
          description: 'Answer questions from the text and read between the lines.',
          minutes: 30,
          band: DifficultyBand.FOUNDATION,
          objectives: [
            ['R3.1a', 'Retrieve and record information from a non-fiction text.'],
            ['R3.1b', 'Draw inferences about characters and justify them with evidence.'],
          ],
        },
        {
          key: 'vocabulary-in-context',
          name: 'Vocabulary in context',
          description: 'Work out the meaning of unfamiliar words from the sentence around them.',
          minutes: 25,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['R3.2a', 'Use context to work out the meaning of an unfamiliar word.'],
            ['R3.2b', 'Discuss words chosen for effect and suggest alternatives.'],
          ],
        },
      ],
    },
    {
      key: 'writing-composition',
      name: 'Writing composition',
      description: 'Punctuated sentences grouped into paragraphs that hold together.',
      topics: [
        {
          key: 'sentence-punctuation',
          name: 'Sentence punctuation',
          description: 'Demarcate sentences accurately, including direct speech.',
          minutes: 25,
          band: DifficultyBand.FOUNDATION,
          objectives: [
            ['W3.1a', 'Use capital letters, full stops, question marks and exclamation marks accurately.'],
            ['W3.1b', 'Punctuate direct speech with inverted commas.'],
          ],
        },
        {
          key: 'paragraphs-and-cohesion',
          name: 'Paragraphs and cohesion',
          description: 'Group related ideas and signal a change of subject or time.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['W3.2a', 'Organise writing into paragraphs around a theme.'],
            ['W3.2b', 'Use conjunctions, adverbs and prepositions to express time and cause.'],
          ],
        },
      ],
    },
  ],
};

const YEAR_4: ProgramSpec = {
  subjectKey: 'english',
  gradeKey: 'year-4',
  key: 'english-y4',
  name: 'English — Year 4',
  framework: 'England KS2 English',
  description: 'Summarising what has been read, and editing what has been written.',
  units: [
    {
      key: 'reading-comprehension',
      name: 'Reading comprehension',
      description: 'Summary, and the effect of an author’s word choice.',
      topics: [
        {
          key: 'summarising-texts',
          name: 'Summarising texts',
          description: 'Identify main ideas across paragraphs and summarise them.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['R4.1a', 'Identify the main idea of each paragraph in a short text.'],
            ['R4.1b', 'Summarise a text in three sentences without losing its meaning.'],
          ],
        },
        {
          key: 'authors-word-choice',
          name: 'The author’s word choice',
          description: 'Explain why a particular word or phrase was chosen.',
          minutes: 25,
          band: DifficultyBand.SECURE,
          objectives: [
            ['R4.2a', 'Discuss words and phrases that capture the reader’s interest.'],
            ['R4.2b', 'Explain the effect of a chosen word on the mood of a passage.'],
          ],
        },
      ],
    },
    {
      key: 'writing-composition',
      name: 'Writing composition',
      description: 'Openings that vary, and the discipline of proofreading.',
      topics: [
        {
          key: 'fronted-adverbials',
          name: 'Fronted adverbials',
          description: 'Vary sentence openings and punctuate them correctly.',
          minutes: 25,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['W4.1a', 'Use fronted adverbials to open a sentence.'],
            ['W4.1b', 'Punctuate a fronted adverbial with a comma.'],
          ],
        },
        {
          key: 'editing-and-proofreading',
          name: 'Editing and proofreading',
          description: 'Reread for sense, then for spelling and punctuation.',
          minutes: 30,
          band: DifficultyBand.SECURE,
          objectives: [
            ['W4.2a', 'Proofread own writing for spelling and punctuation errors.'],
            ['W4.2b', 'Improve a paragraph by replacing repeated or imprecise words.'],
          ],
        },
      ],
    },
  ],
};

const YEAR_5: ProgramSpec = {
  subjectKey: 'english',
  gradeKey: 'year-5',
  key: 'english-y5',
  name: 'English — Year 5',
  framework: 'England KS2 English',
  description: 'Comparison across texts, and planning before drafting.',
  units: [
    {
      key: 'reading-comprehension',
      name: 'Reading comprehension',
      description: 'Comparing two texts, and reading figurative language.',
      topics: [
        {
          key: 'comparing-texts',
          name: 'Comparing texts',
          description: 'Compare how two texts treat the same subject.',
          minutes: 35,
          band: DifficultyBand.SECURE,
          objectives: [
            ['R5.1a', 'Compare the viewpoint of two texts on the same topic.'],
            ['R5.1b', 'Support a comparison with a short quotation from each text.'],
          ],
        },
        {
          key: 'figurative-language',
          name: 'Figurative language',
          description: 'Simile, metaphor and personification, and what they do for the reader.',
          minutes: 30,
          band: DifficultyBand.CHALLENGE,
          objectives: [
            ['R5.2a', 'Identify similes, metaphors and personification in a passage.'],
            ['R5.2b', 'Explain the image a metaphor creates for the reader.'],
          ],
        },
      ],
    },
    {
      key: 'writing-composition',
      name: 'Writing composition',
      description: 'Clause structure, and a plan that survives contact with the draft.',
      topics: [
        {
          key: 'relative-clauses',
          name: 'Relative clauses',
          description: 'Add detail with a relative clause, punctuated correctly.',
          minutes: 30,
          band: DifficultyBand.SECURE,
          objectives: [
            ['W5.1a', 'Use relative clauses beginning with who, which, where, when or whose.'],
            ['W5.1b', 'Use commas or brackets to mark a parenthesis.'],
          ],
        },
        {
          key: 'planning-narrative',
          name: 'Planning a narrative',
          description: 'Plan setting, characters and structure before drafting.',
          minutes: 35,
          band: DifficultyBand.CHALLENGE,
          objectives: [
            ['W5.2a', 'Plan a narrative by noting setting, characters and the shape of the plot.'],
            ['W5.2b', 'Describe settings and characters to convey atmosphere deliberately.'],
          ],
        },
      ],
    },
  ],
};

export const ENGLISH_PROGRAMS: readonly ProgramSpec[] = [YEAR_3, YEAR_4, YEAR_5];
