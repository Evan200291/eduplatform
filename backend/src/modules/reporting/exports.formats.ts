// ─────────────────────────────────────────────────────────────────────────────
// Export serialisation
// Blueprint 04's honesty rule has to survive leaving the building. A CSV that a
// head teacher forwards to a governor is read without the screen it came from, so
// every format here writes the measure and limitation notes into the file itself —
// as comment rows in CSV, as a `measure` object in JSON, as a header block in the
// spreadsheet and on the first page of the PDF.
//
// A figure that travels without its caveat is the thing blueprint 04 is against,
// and a footer nobody rendered is not a caveat.
// ─────────────────────────────────────────────────────────────────────────────

import { ReportFormat } from '@prisma/client';
import type { ReportColumn } from './reporting.reports';
import { buildPdf } from './exports.pdf';
import { buildXlsx } from './exports.xlsx';

export interface ExportPayload {
  reportName: string;
  reportKey: string;
  measureNotes: string;
  limitationNotes: string;
  evidenceSources: string[];
  window: { from: Date; to: Date };
  cohortSize: number;
  scope: string;
  generatedAt: Date;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export interface SerialisedExport {
  content: Buffer;
  mimeType: string;
  extension: string;
}

export const FORMAT_MIME: Record<ReportFormat, string> = {
  [ReportFormat.CSV]: 'text/csv; charset=utf-8',
  [ReportFormat.JSON]: 'application/json; charset=utf-8',
  [ReportFormat.XLSX]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  [ReportFormat.PDF]: 'application/pdf',
};

const FORMAT_EXTENSION: Record<ReportFormat, string> = {
  [ReportFormat.CSV]: 'csv',
  [ReportFormat.JSON]: 'json',
  [ReportFormat.XLSX]: 'xlsx',
  [ReportFormat.PDF]: 'pdf',
};

export function serialise(format: ReportFormat, payload: ExportPayload): SerialisedExport {
  const content =
    format === ReportFormat.JSON
      ? toJson(payload)
      : format === ReportFormat.XLSX
        ? buildXlsx(payload)
        : format === ReportFormat.PDF
          ? buildPdf(payload)
          : toCsv(payload);

  return { content, mimeType: FORMAT_MIME[format], extension: FORMAT_EXTENSION[format] };
}

/** A file name a human can read a week later without opening it. */
export function exportFileName(reportKey: string, when: Date, extension: string): string {
  const stamp = when.toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const safe = reportKey.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 60);
  return `${safe}-${stamp}.${extension}`;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function toCsv(payload: ExportPayload): Buffer {
  const lines: string[] = [
    `# ${payload.reportName}`,
    `# Window: ${isoDay(payload.window.from)} to ${isoDay(payload.window.to)}`,
    `# Learners included: ${payload.cohortSize} (${payload.scope})`,
    `# Generated: ${payload.generatedAt.toISOString()}`,
    `# Evidence: ${payload.evidenceSources.join(', ')}`,
    `# What this measures: ${payload.measureNotes}`,
    `# What it does not prove: ${payload.limitationNotes}`,
    '',
    payload.columns.map((column) => csvCell(column.label)).join(','),
  ];

  for (const row of payload.rows) {
    lines.push(
      payload.columns.map((column) => csvCell(formatValue(row[column.key], column))).join(','),
    );
  }

  // A BOM, because a UK school opening a CSV is opening it in Excel.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

function csvCell(value: string): string {
  if (value === '') return '';
  // Guard against a value that a spreadsheet would evaluate as a formula.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

// ── JSON ────────────────────────────────────────────────────────────────────

function toJson(payload: ExportPayload): Buffer {
  const body = {
    report: { key: payload.reportKey, name: payload.reportName },
    measure: {
      measureNotes: payload.measureNotes,
      limitationNotes: payload.limitationNotes,
      evidenceSources: payload.evidenceSources,
    },
    window: { from: payload.window.from.toISOString(), to: payload.window.to.toISOString() },
    cohort: { size: payload.cohortSize, scope: payload.scope },
    generatedAt: payload.generatedAt.toISOString(),
    columns: payload.columns,
    rows: payload.rows,
    rowCount: payload.rows.length,
  };
  return Buffer.from(JSON.stringify(body, null, 2), 'utf8');
}

// ── Shared value formatting ─────────────────────────────────────────────────

/** One place where a null becomes a dash, so no two formats disagree. */
export function formatValue(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return column.type === 'date' ? isoDay(value) : value.toISOString();
  if (typeof value === 'number') return column.type === 'percent' ? `${value}%` : String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** True when a cell should be written as a spreadsheet number rather than text. */
export function isNumeric(value: unknown, column: ReportColumn): value is number {
  return typeof value === 'number' && (column.type === 'number' || column.type === 'percent');
}

export function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Human-readable provenance block, shared by the spreadsheet and PDF writers. */
export function provenanceLines(payload: ExportPayload): Array<[string, string]> {
  return [
    ['Report', payload.reportName],
    ['Window', `${isoDay(payload.window.from)} to ${isoDay(payload.window.to)}`],
    ['Learners included', `${payload.cohortSize} (${payload.scope})`],
    ['Generated', payload.generatedAt.toISOString()],
    ['Evidence', payload.evidenceSources.join(', ')],
    ['What this measures', payload.measureNotes],
    ['What it does not prove', payload.limitationNotes],
  ];
}
