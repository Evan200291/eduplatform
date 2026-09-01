// ─────────────────────────────────────────────────────────────────────────────
// Question bank — matching and sorting items
//
// Blueprint 03 lists MATCHING and SORTING among the supported initial forms, so
// the demo has to contain real examples of both rather than only choice-based
// items. They live in one file instead of being sprinkled through the subject
// banks because they share a shape (`pairs` / `order`) and because a reviewer
// checking "is every question form covered?" then has one place to look.
//
// These are merged with the subject banks by `questions.ts`, which concatenates
// per topic key: a topic named here ends up with four questions, not three, and
// the extra one lands on that topic's extension activity.
// ─────────────────────────────────────────────────────────────────────────────

import { QuestionType } from '@prisma/client';

import type { QuestionBank } from './questions.types';

export const FORM_QUESTIONS: QuestionBank = {
  'maths-y3:numbers-to-1000': [
    {
      type: QuestionType.SORTING,
      prompt: 'Put these numbers in order, smallest first.',
      explanation: 'Compare the hundreds digit first. If they match, compare the tens, then the ones.',
      objective: 1,
      hint: 'Start with the hundreds digit of each number.',
      order: ['307', '370', '703', '730'],
    },
  ],
  'maths-y3:tables-3-4-8': [
    {
      type: QuestionType.MATCHING,
      prompt: 'Match each multiplication fact to its product.',
      explanation: 'The 8 times table is double the 4 times table, which is useful for checking.',
      objective: 0,
      hint: 'Work out the ones you know first, then use what is left.',
      pairs: [
        ['3 × 7', '21'],
        ['4 × 6', '24'],
        ['8 × 5', '40'],
        ['8 × 9', '72'],
      ],
    },
  ],
  'maths-y4:equivalent-fractions': [
    {
      type: QuestionType.MATCHING,
      prompt: 'Match each fraction to an equivalent fraction.',
      explanation: 'Multiply or divide the numerator and denominator by the same number.',
      objective: 0,
      hint: 'Ask yourself what you multiplied the denominator by.',
      pairs: [
        ['1/2', '4/8'],
        ['1/3', '3/9'],
        ['2/5', '4/10'],
        ['3/4', '9/12'],
      ],
    },
  ],
  'english-y3:sentence-punctuation': [
    {
      type: QuestionType.MATCHING,
      prompt: 'Match each punctuation mark to the job it does.',
      explanation: 'Each mark tells the reader something different about how to read the sentence.',
      objective: 1,
      hint: 'Say each sentence type aloud and listen to your voice.',
      pairs: [
        ['Full stop', 'Ends a statement'],
        ['Question mark', 'Ends a question'],
        ['Exclamation mark', 'Shows strong feeling'],
        ['Capital letter', 'Starts a sentence or a name'],
      ],
    },
  ],
  'english-y5:planning-narrative': [
    {
      type: QuestionType.SORTING,
      prompt: 'Put the stages of a story plan in the order you would write them.',
      explanation: 'Opening, build-up, problem, resolution — tension rises then settles.',
      objective: 0,
      hint: 'Something must go wrong before it can be put right.',
      order: ['Opening', 'Build-up', 'Problem', 'Resolution'],
    },
  ],
  'science-y4:solids-liquids-gases': [
    {
      type: QuestionType.MATCHING,
      prompt: 'Match each material to its state at room temperature.',
      explanation: 'A solid keeps its shape, a liquid takes the shape of its container, a gas fills it.',
      objective: 0,
      hint: 'Picture each one on a table in front of you.',
      pairs: [
        ['Ice cube', 'Solid'],
        ['Milk', 'Liquid'],
        ['Helium in a balloon', 'Gas'],
        ['Wooden ruler', 'Solid'],
      ],
    },
  ],
  'science-y4:evaporation-condensation': [
    {
      type: QuestionType.SORTING,
      prompt: 'Put the stages of the water cycle in order, starting at the sea.',
      explanation: 'Water evaporates, condenses into cloud, falls as precipitation, then flows back.',
      objective: 1,
      hint: 'Follow one drop of water all the way round.',
      order: [
        'Water evaporates from the sea',
        'Water vapour rises and cools',
        'Vapour condenses into clouds',
        'Rain falls and runs back to the sea',
      ],
    },
  ],
  'science-y5:planets-and-orbits': [
    {
      type: QuestionType.SORTING,
      prompt: 'Put these planets in order, closest to the Sun first.',
      explanation: 'The order outwards is Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.',
      objective: 0,
      hint: 'Earth is the third planet from the Sun.',
      order: ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter'],
    },
  ],
};
