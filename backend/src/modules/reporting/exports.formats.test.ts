// ─────────────────────────────────────────────────────────────────────────────
// Export writer tests
// These are the tests worth having for this module: the four writers are pure
// functions over a payload, so they can be checked exactly, with no database and
// no HTTP. The ZIP and PDF containers are hand-written, so the structural checks
// here (CRC per entry, xref offsets landing on their objects) are what stand
// between a "successful" export and a file a school cannot open.
//
// The honesty assertions are deliberate too: blueprint 04's measure and limitation
// notes must appear in every format, and a test is the only thing that keeps that
// true after someone refactors a header block.
// ─────────────────────────────────────────────────────────────────────────────

import { inflateRawSync } from 'node:zlib';
import { ReportFormat } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../../core/utils/zip';
import { exportFileName, serialise } from './exports.formats';
import type { ExportPayload } from './exports.formats';

const NEWLINE = String.fromCharCode(10);

const payload: ExportPayload = {
  reportName: 'Activity summary',
  reportKey: 'engagement.activity-summary',
  measureNotes:
    'Counts activities the learner marked complete and sums recorded active time for the window shown.',
  limitationNotes:
    'This does not show what the learner can do. Time on task will over-count a tab left open, and under-count work done on paper.',
  evidenceSources: ['ProgressRecord'],
  window: { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-29T00:00:00Z') },
  cohortSize: 3,
  scope: 'CLASS',
  generatedAt: new Date('2026-08-29T21:30:00Z'),
  columns: [
    { key: 'learner', label: 'Learner', type: 'text' },
    { key: 'activitiesCompleted', label: 'Activities completed', type: 'number' },
    { key: 'minutes', label: 'Minutes active', type: 'number' },
    { key: 'lastActive', label: 'Last active', type: 'date' },
  ],
  rows: [
    {
      learner: 'Ayşe Yılmaz',
      activitiesCompleted: 12,
      minutes: 96,
      lastActive: new Date('2026-08-28T10:00:00Z'),
    },
    { learner: '=cmd|calc', activitiesCompleted: 0, minutes: 0, lastActive: null },
    {
      learner: 'Jamie O’Brien — a name long enough to need clipping in a PDF column',
      activitiesCompleted: 7,
      minutes: 41,
      lastActive: new Date('2026-08-27T09:15:00Z'),
    },
  ],
};

describe('CSV export', () => {
  const csv = serialise(ReportFormat.CSV, payload);
  const text = csv.content.toString('utf8');

  it('opens correctly in Excel', () => {
    expect(csv.content[0]).toBe(0xef);
    expect(csv.content[1]).toBe(0xbb);
    expect(csv.content[2]).toBe(0xbf);
    expect(csv.mimeType).toContain('text/csv');
  });

  it('states what it measures and what it does not prove', () => {
    expect(text).toContain('# What this measures:');
    expect(text).toContain('# What it does not prove:');
    expect(text).toContain(payload.limitationNotes);
  });

  it('neutralises a value a spreadsheet would evaluate', () => {
    expect(text).toContain('"\'=cmd|calc"');
  });

  it('writes a date column as a day', () => {
    expect(text).toContain('"2026-08-28"');
  });
});

describe('JSON export', () => {
  it('carries the measure block beside the rows', () => {
    const json = serialise(ReportFormat.JSON, payload);
    const parsed = JSON.parse(json.content.toString('utf8')) as {
      measure: { measureNotes: string; limitationNotes: string };
      rowCount: number;
    };

    expect(parsed.measure.measureNotes).toBe(payload.measureNotes);
    expect(parsed.measure.limitationNotes).toBe(payload.limitationNotes);
    expect(parsed.rowCount).toBe(3);
  });
});

describe('XLSX export', () => {
  const xlsx = serialise(ReportFormat.XLSX, payload);
  const parts = readZip(xlsx.content);

  it('is a ZIP whose every entry checksums', () => {
    expect(xlsx.content[0]).toBe(0x50);
    expect(xlsx.content[1]).toBe(0x4b);
    expect(parts).toHaveLength(7);
    expect(parts.every((part) => part.crcOk)).toBe(true);
  });

  it('declares the parts a reader needs', () => {
    const names = parts.map((part) => part.name);
    expect(names).toContain('[Content_Types].xml');
    expect(names).toContain('xl/workbook.xml');
    expect(names).toContain('xl/styles.xml');
    expect(names).toContain('xl/worksheets/sheet1.xml');
    expect(names).toContain('xl/worksheets/sheet2.xml');
  });

  it('writes numbers as numbers and headers in bold', () => {
    const sheet = partText(parts, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<v>96</v>');
    expect(sheet).toContain('s="1" t="inlineStr"><is><t xml:space="preserve">Learner');
    expect(sheet).toContain('<row r="4">');
  });

  it('emits no character XML cannot represent', () => {
    const sheet = partText(parts, 'xl/worksheets/sheet1.xml');
    const illegal = [...sheet].some((character) => {
      const code = character.codePointAt(0) ?? 32;
      return code < 32 && character !== NEWLINE;
    });
    expect(illegal).toBe(false);
  });

  it('keeps the caveats on their own sheet', () => {
    expect(partText(parts, 'xl/worksheets/sheet2.xml')).toContain('What it does not prove');
  });
});

describe('PDF export', () => {
  const pdf = serialise(ReportFormat.PDF, payload);
  const text = pdf.content.toString('latin1');

  it('is a structurally valid PDF', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/BaseFont /Helvetica');
  });

  it('points every xref entry at its object', () => {
    const match = /startxref\s+(\d+)/.exec(text);
    expect(match).not.toBeNull();

    const start = Number(match?.[1]);
    expect(text.slice(start, start + 4)).toBe('xref');

    const offsets = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((row) =>
      Number(row[1]),
    );
    expect(offsets.length).toBeGreaterThanOrEqual(6);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset).startsWith(`${index + 1} 0 obj`)).toBe(true);
    });
  });

  it('puts the caveat on page one, not in a footnote', () => {
    expect(text).toContain('(Activity summary) Tj');
    expect(text).toContain('does not show what the learner');
  });

  it('transliterates rather than emitting a byte Helvetica cannot draw', () => {
    expect(text).toContain("Jamie O'Brien");
    expect([...pdf.content].every((byte) => byte <= 0xff)).toBe(true);
  });
});

describe('exportFileName', () => {
  it('is readable a week later and safe on any filesystem', () => {
    expect(exportFileName('engagement.activity-summary', payload.generatedAt, 'pdf')).toBe(
      'engagement.activity-summary-2026-08-29-21-30.pdf',
    );
    expect(exportFileName('../../etc/passwd', payload.generatedAt, 'csv')).toBe(
      '..-..-etc-passwd-2026-08-29-21-30.csv',
    );
  });
});

interface ZipPart {
  name: string;
  text: string;
  crcOk: boolean;
}

function partText(parts: ZipPart[], name: string): string {
  return parts.find((part) => part.name === name)?.text ?? '';
}

/** Walks the local file headers, inflating and checksumming each entry. */
function readZip(buffer: Buffer): ZipPart[] {
  const parts: ZipPart[] = [];
  let cursor = 0;
  while (cursor + 30 <= buffer.length && buffer.readUInt32LE(cursor) === 0x04034b50) {
    const method = buffer.readUInt16LE(cursor + 8);
    const crc = buffer.readUInt32LE(cursor + 14);
    const compressedSize = buffer.readUInt32LE(cursor + 18);
    const nameLength = buffer.readUInt16LE(cursor + 26);
    const extraLength = buffer.readUInt16LE(cursor + 28);
    const name = buffer.subarray(cursor + 30, cursor + 30 + nameLength).toString('utf8');
    const dataStart = cursor + 30 + nameLength + extraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    parts.push({ name, text: data.toString('utf8'), crcOk: crc32(data) === crc });
    cursor = dataStart + compressedSize;
  }
  return parts;
}
