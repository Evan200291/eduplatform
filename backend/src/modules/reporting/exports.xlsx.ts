// ─────────────────────────────────────────────────────────────────────────────
// XLSX writer
// A spreadsheet is what a school actually asks for, and an .xlsx is a ZIP of a few
// small XML parts. Writing them here rather than adding a spreadsheet library
// keeps the dependency list short enough to audit — which is the point of the
// deployment being a single PM2 process on one VPS.
//
// Numbers are written as numbers, not as text, because a figure a head teacher
// cannot sort or total is a figure they will retype by hand and get wrong.
// ─────────────────────────────────────────────────────────────────────────────

import { zipSync } from '../../core/utils/zip';
import type { ZipEntry } from '../../core/utils/zip';
import { formatValue, isNumeric, provenanceLines } from './exports.formats';
import type { ExportPayload } from './exports.formats';

/** Style ids declared in `styles.xml` below. */
const STYLE_DEFAULT = 0;
const STYLE_BOLD = 1;
const STYLE_WRAP = 2;

export function buildXlsx(payload: ExportPayload): Buffer {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: text(contentTypes()) },
    { name: '_rels/.rels', data: text(rootRels()) },
    { name: 'xl/workbook.xml', data: text(workbook()) },
    { name: 'xl/_rels/workbook.xml.rels', data: text(workbookRels()) },
    { name: 'xl/styles.xml', data: text(styles()) },
    { name: 'xl/worksheets/sheet1.xml', data: text(dataSheet(payload)) },
    { name: 'xl/worksheets/sheet2.xml', data: text(aboutSheet(payload)) },
  ];
  return zipSync(entries, payload.generatedAt);
}

function text(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

// ── The sheets ──────────────────────────────────────────────────────────────

function dataSheet(payload: ExportPayload): string {
  const rows: string[] = [];

  rows.push(
    row(
      1,
      payload.columns.map((column, index) => inlineCell(index, 1, column.label, STYLE_BOLD)),
    ),
  );

  payload.rows.forEach((record, recordIndex) => {
    const rowNumber = recordIndex + 2;
    const cells = payload.columns.map((column, columnIndex) => {
      const value = record[column.key];
      if (isNumeric(value, column)) return numberCell(columnIndex, rowNumber, value);
      return inlineCell(columnIndex, rowNumber, formatValue(value, column), STYLE_DEFAULT);
    });
    rows.push(row(rowNumber, cells));
  });

  const widths = payload.columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${widthFor(column.label)}" customWidth="1"/>`,
    )
    .join('');

  return [
    xmlHeader(),
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
    `<cols>${widths}</cols>`,
    `<sheetData>${rows.join('')}</sheetData>`,
    '</worksheet>',
  ].join('');
}

/**
 * The second sheet exists so the caveats cannot be separated from the figures by
 * someone copying the first sheet into an email.
 */
function aboutSheet(payload: ExportPayload): string {
  const rows = provenanceLines(payload).map((pair, index) => {
    const rowNumber = index + 1;
    return row(rowNumber, [
      inlineCell(0, rowNumber, pair[0], STYLE_BOLD),
      inlineCell(1, rowNumber, pair[1], STYLE_WRAP),
    ]);
  });

  return [
    xmlHeader(),
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="96" customWidth="1"/></cols>',
    `<sheetData>${rows.join('')}</sheetData>`,
    '</worksheet>',
  ].join('');
}

function row(number: number, cells: string[]): string {
  return `<row r="${number}">${cells.join('')}</row>`;
}

function inlineCell(columnIndex: number, rowNumber: number, value: string, style: number): string {
  const cell = reference(columnIndex, rowNumber);
  if (value === '') return `<c r="${cell}" s="${style}"/>`;
  return `<c r="${cell}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numberCell(columnIndex: number, rowNumber: number, value: number): string {
  return `<c r="${reference(columnIndex, rowNumber)}"><v>${value}</v></c>`;
}

/** Zero-based column index to a spreadsheet reference: 0 → A1, 26 → AA1. */
export function reference(columnIndex: number, rowNumber: number): string {
  let index = columnIndex;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (index % 26)) + letters;
    index = Math.floor(index / 26) - 1;
  } while (index >= 0);
  return `${letters}${rowNumber}`;
}

function widthFor(label: string): number {
  return Math.min(40, Math.max(12, label.length + 4));
}

function escapeXml(value: string): string {
  return stripControls(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Removes the control characters XML 1.0 cannot represent at all, escaped or not.
 * Tab, newline and carriage return are the three that are legal and are kept. A
 * file the school cannot open is worse than a file missing a stray byte.
 */
function stripControls(value: string): string {
  let output = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 32;
    if (code === 9 || code === 10 || code === 13 || code >= 32) output += character;
  }
  return output;
}

// ── The fixed parts ─────────────────────────────────────────────────────────

function xmlHeader(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}

function contentTypes(): string {
  return [
    xmlHeader(),
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '</Types>',
  ].join('');
}

function rootRels(): string {
  return [
    xmlHeader(),
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join('');
}

function workbook(): string {
  return [
    xmlHeader(),
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets>',
    '<sheet name="Report" sheetId="1" r:id="rId1"/>',
    '<sheet name="About this report" sheetId="2" r:id="rId2"/>',
    '</sheets>',
    '</workbook>',
  ].join('');
}

function workbookRels(): string {
  return [
    xmlHeader(),
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '</Relationships>',
  ].join('');
}

function styles(): string {
  return [
    xmlHeader(),
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="2">',
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    '</fonts>',
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>',
    '<borders count="1"><border/></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="3">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '</cellXfs>',
    '</styleSheet>',
  ].join('');
}
