import { describe, expect, it } from 'vitest';
import { parseCsv, readCsvRecords } from './csv';
import { formatAboutMinutes } from './format';

describe('parseCsv', () => {
  it('handles quotes, embedded commas, doubled quotes and CRLF', () => {
    const text = '\uFEFFname,note\r\n"Chen, Amara","said ""hi"""\r\n\r\nDiallo,plain\r\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Chen, Amara', 'said "hi"'],
      ['Diallo', 'plain'],
    ]);
  });

  it('keeps a last line with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('readCsvRecords', () => {
  it('matches header spellings and reports missing columns', () => {
    const { records, missingColumns } = readCsvRecords('E-mail Address,Role\nsam@school.test,Teacher\n', {
      email: ['emailaddress', 'e-mail'],
      role: [],
      subject: [],
    });
    expect(records).toEqual([{ email: 'sam@school.test', role: 'Teacher' }]);
    expect(missingColumns).toEqual(['subject']);
  });
});

describe('formatAboutMinutes', () => {
  it('rounds to friendly numbers and says nothing for missing values', () => {
    expect(formatAboutMinutes(null)).toBeNull();
    expect(formatAboutMinutes(0)).toBeNull();
    expect(formatAboutMinutes(1)).toBe('About 2 minutes');
    expect(formatAboutMinutes(7)).toBe('About 7 minutes');
    expect(formatAboutMinutes(22)).toBe('About 20 minutes');
    expect(formatAboutMinutes(60)).toBe('About an hour');
    expect(formatAboutMinutes(95)).toBe('About 1.5 hours');
  });
});
