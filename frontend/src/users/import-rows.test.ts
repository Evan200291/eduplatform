import { describe, expect, it } from 'vitest';
import { planClassRows, planStaffRows } from './import-rows';

describe('planStaffRows', () => {
  it('defaults to Teacher and flags bad, repeated and unknown rows', () => {
    const plan = planStaffRows([
      { email: 'Sam@School.test' },
      { email: 'lee@school.test', role: 'School Admin' },
      { email: 'not-an-email' },
      { email: 'sam@school.test' },
      { email: 'kim@school.test', role: 'Janitor' },
    ]);
    expect(plan.map((row) => [row.email, row.roleKey, row.problem === null])).toEqual([
      ['sam@school.test', 'TEACHER', true],
      ['lee@school.test', 'SCHOOL_ADMIN', true],
      ['not-an-email', 'TEACHER', false],
      ['sam@school.test', 'TEACHER', false],
      ['kim@school.test', null, false],
    ]);
    expect(plan[0].line).toBe(2);
  });
});

describe('planClassRows', () => {
  const lookup = {
    grades: [{ id: 'g7', name: 'Year 7', level: 7 }],
    subjects: [
      { id: 's1', name: 'Mathematics', key: 'maths' },
      { id: 's2', name: 'English', key: 'english' },
    ],
    teachers: [{ id: 't1', email: 'sam@school.test', displayName: 'Sam Teacher' }],
  };

  it('matches grades, subjects and teachers by name, key, level or email', () => {
    const [row] = planClassRows(
      [{ name: '7A', grade: 'year 7', code: '7A-MATH', subjects: 'maths; English', teacher: 'SAM@school.test' }],
      lookup,
    );
    expect(row).toMatchObject({
      gradeId: 'g7',
      subjectIds: ['s1', 's2'],
      teacherId: 't1',
      problem: null,
    });
  });

  it('explains what is wrong with a row', () => {
    const plan = planClassRows(
      [
        { name: '7B', grade: 'Year 9' },
        { name: '7C', grade: '7', subjects: 'Latin' },
        { name: '7D', grade: '7', teacher: 'nobody@school.test' },
        { name: '7E', grade: '7', code: 'bad code' },
      ],
      lookup,
    );
    expect(plan.map((row) => row.problem)).toEqual([
      'No grade called "Year 9". Add it under Grades first, or fix the spelling.',
      'Unknown subject: Latin.',
      'No teacher account with the email nobody@school.test. Invite them first.',
      'Class codes use letters, numbers and hyphens only.',
    ]);
  });
});
