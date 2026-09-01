// ─────────────────────────────────────────────────────────────────────────────
// Curriculum data — Mathematics, Years 3 to 5
// Two units per year group, two topics per unit, two objectives per topic. Small
// enough to read, wide enough that every dashboard, path and report in the demo
// has real structure underneath it.
// ─────────────────────────────────────────────────────────────────────────────

import { DifficultyBand } from '@prisma/client';

import type { ProgramSpec } from './curriculum.types';

const YEAR_3: ProgramSpec = {
  subjectKey: 'mathematics',
  gradeKey: 'year-3',
  key: 'maths-y3',
  name: 'Mathematics — Year 3',
  framework: 'England KS2 Mathematics',
  description: 'Place value to 1,000 and the written methods that carry into Year 4.',
  units: [
    {
      key: 'number-place-value',
      name: 'Number and place value',
      description: 'Reading, writing, comparing and ordering three-digit numbers.',
      topics: [
        {
          key: 'numbers-to-1000',
          name: 'Numbers to 1,000',
          description: 'Represent, name and partition three-digit numbers.',
          minutes: 25,
          band: DifficultyBand.FOUNDATION,
          objectives: [
            ['N3.1a', 'Read and write numbers up to 1,000 in numerals and in words.'],
            ['N3.1b', 'Find 10 or 100 more or less than a given three-digit number.'],
          ],
        },
        {
          key: 'compare-order-1000',
          name: 'Comparing and ordering to 1,000',
          description: 'Use place value to decide which of two numbers is larger.',
          minutes: 20,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['N3.2a', 'Compare two three-digit numbers using the symbols <, > and =.'],
            ['N3.2b', 'Order a set of four three-digit numbers from smallest to largest.'],
          ],
        },
      ],
    },
    {
      key: 'addition-subtraction',
      name: 'Addition and subtraction',
      description: 'Column methods, exchange, and choosing between mental and written work.',
      topics: [
        {
          key: 'add-subtract-3-digit',
          name: 'Adding and subtracting three-digit numbers',
          description: 'Column addition and subtraction, including one exchange.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['C3.1a', 'Add two three-digit numbers using column addition without exchange.'],
            ['C3.1b', 'Subtract a three-digit number using column subtraction with one exchange.'],
          ],
        },
        {
          key: 'tables-3-4-8',
          name: 'The 3, 4 and 8 times tables',
          description: 'Recall and use multiplication facts for 3, 4 and 8.',
          minutes: 25,
          band: DifficultyBand.SECURE,
          objectives: [
            ['C3.2a', 'Recall multiplication and division facts for the 3, 4 and 8 times tables.'],
            ['C3.2b', 'Use known facts to solve missing-number problems such as 4 x ? = 32.'],
          ],
        },
      ],
    },
  ],
};

const YEAR_4: ProgramSpec = {
  subjectKey: 'mathematics',
  gradeKey: 'year-4',
  key: 'maths-y4',
  name: 'Mathematics — Year 4',
  framework: 'England KS2 Mathematics',
  description: 'Place value to 10,000, rounding, and the first formal work on fractions.',
  units: [
    {
      key: 'number-place-value',
      name: 'Number and place value',
      description: 'Four-digit numbers, rounding and negative numbers in context.',
      topics: [
        {
          key: 'numbers-to-10000',
          name: 'Numbers to 10,000',
          description: 'Partition and represent four-digit numbers.',
          minutes: 25,
          band: DifficultyBand.FOUNDATION,
          objectives: [
            ['N4.1a', 'Recognise the place value of each digit in a four-digit number.'],
            ['N4.1b', 'Count in multiples of 6, 7, 9, 25 and 1,000 from any starting point.'],
          ],
        },
        {
          key: 'rounding-negative-numbers',
          name: 'Rounding and negative numbers',
          description: 'Round to the nearest 10, 100 or 1,000 and count through zero.',
          minutes: 25,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['N4.2a', 'Round any four-digit number to the nearest 10, 100 or 1,000.'],
            ['N4.2b', 'Count backwards through zero to include negative numbers.'],
          ],
        },
      ],
    },
    {
      key: 'fractions-decimals',
      name: 'Fractions and decimals',
      description: 'Equivalence, hundredths and the link between the two notations.',
      topics: [
        {
          key: 'equivalent-fractions',
          name: 'Equivalent fractions',
          description: 'Families of equivalent fractions using diagrams and factors.',
          minutes: 30,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['F4.1a', 'Recognise and name families of common equivalent fractions.'],
            ['F4.1b', 'Add and subtract fractions with the same denominator.'],
          ],
        },
        {
          key: 'decimal-tenths-hundredths',
          name: 'Tenths and hundredths',
          description: 'Read, write and compare decimals to two places.',
          minutes: 30,
          band: DifficultyBand.SECURE,
          objectives: [
            ['F4.2a', 'Write decimal equivalents of any number of tenths or hundredths.'],
            ['F4.2b', 'Compare numbers with the same number of decimal places up to two places.'],
          ],
        },
      ],
    },
  ],
};

const YEAR_5: ProgramSpec = {
  subjectKey: 'mathematics',
  gradeKey: 'year-5',
  key: 'maths-y5',
  name: 'Mathematics — Year 5',
  framework: 'England KS2 Mathematics',
  description: 'Numbers to a million, powers of ten, and fractions with unlike denominators.',
  units: [
    {
      key: 'number-place-value',
      name: 'Number and place value',
      description: 'Six-digit numbers, powers of ten and rounding to any power.',
      topics: [
        {
          key: 'numbers-to-1000000',
          name: 'Numbers to 1,000,000',
          description: 'Read, write and compare numbers to at least a million.',
          minutes: 25,
          band: DifficultyBand.DEVELOPING,
          objectives: [
            ['N5.1a', 'Read, write, order and compare numbers to at least 1,000,000.'],
            ['N5.1b', 'Interpret negative numbers in context and count across zero.'],
          ],
        },
        {
          key: 'powers-of-ten-rounding',
          name: 'Powers of ten and rounding',
          description: 'Multiply and divide by 10, 100 and 1,000 and round accordingly.',
          minutes: 25,
          band: DifficultyBand.SECURE,
          objectives: [
            ['N5.2a', 'Multiply and divide whole numbers by 10, 100 and 1,000.'],
            ['N5.2b', 'Round any number up to 1,000,000 to the nearest 10, 100, 1,000 or 100,000.'],
          ],
        },
      ],
    },
    {
      key: 'fractions-percentages',
      name: 'Fractions and percentages',
      description: 'Unlike denominators, and percentages as a special kind of fraction.',
      topics: [
        {
          key: 'add-subtract-fractions',
          name: 'Adding and subtracting fractions',
          description: 'Fractions whose denominators are multiples of the same number.',
          minutes: 35,
          band: DifficultyBand.SECURE,
          objectives: [
            ['F5.1a', 'Add and subtract fractions with denominators that are multiples of each other.'],
            ['F5.1b', 'Convert between mixed numbers and improper fractions.'],
          ],
        },
        {
          key: 'percentages-of-amounts',
          name: 'Percentages of amounts',
          description: 'Find simple percentages and connect them to fractions and decimals.',
          minutes: 30,
          band: DifficultyBand.CHALLENGE,
          objectives: [
            ['F5.2a', 'Recognise the per cent symbol and write a percentage as a fraction of 100.'],
            ['F5.2b', 'Find 10%, 25% and 50% of an amount and use these to find others.'],
          ],
        },
      ],
    },
  ],
};

export const MATHEMATICS_PROGRAMS: readonly ProgramSpec[] = [YEAR_3, YEAR_4, YEAR_5];
