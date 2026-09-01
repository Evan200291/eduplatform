// ─────────────────────────────────────────────────────────────────────────────
// PDF writer
// A PDF is what gets printed for a governors' meeting or a parents' evening, which
// makes it the format most likely to be read by someone who never saw the screen it
// came from. So the first page is the provenance block — what this measures, where
// it came from, what it does not prove — and the table follows it. The caveats are
// not a footnote here; they are page one.
//
// This writes the PDF by hand (base-14 Helvetica, no compression, no embedded
// fonts) rather than pulling in a PDF library. That is a deliberate trade: the
// output is plain and the code is 250 lines of format that will still build in five
// years, with nothing to keep up to date.
// ─────────────────────────────────────────────────────────────────────────────

import { formatValue, provenanceLines } from './exports.formats';
import type { ExportPayload } from './exports.formats';
import type { ReportColumn } from './reporting.reports';

/** A4 landscape, in PDF points. A wide table beats a tall one for a report. */
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const TITLE_SIZE = 15;
const NOTE_SIZE = 8.5;
const TABLE_SIZE = 8.5;
const LINE = 11.5;
const ROW_HEIGHT = 14;
/** Helvetica's average advance, close enough to lay out a table of figures. */
const CHAR_RATIO = 0.5;

const FONT_REGULAR = '/F1';
const FONT_BOLD = '/F2';

interface Layout {
  column: ReportColumn;
  x: number;
  width: number;
}

export function buildPdf(payload: ExportPayload): Buffer {
  const layout = columnLayout(payload);
  const pages = paginate(payload, layout);
  return assemble(pages);
}

// ── Layout ──────────────────────────────────────────────────────────────────

/** Columns are widened by what is actually in them, not by an even split. */
function columnLayout(payload: ExportPayload): Layout[] {
  const sample = payload.rows.slice(0, 40);
  const weights = payload.columns.map((column) => {
    let widest = column.label.length;
    for (const row of sample) {
      const length = formatValue(row[column.key], column).length;
      if (length > widest) widest = length;
    }
    return Math.min(46, Math.max(6, widest)) + 2;
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let x = MARGIN;
  return payload.columns.map((column, index) => {
    const width = (CONTENT_WIDTH * (weights[index])) / total;
    const entry: Layout = { column, x, width };
    x += width;
    return entry;
  });
}

function charsThatFit(width: number, size: number): number {
  return Math.max(3, Math.floor(width / (size * CHAR_RATIO)));
}

/** Splits on spaces where it can, mid-word only when a word is longer than the line. */
function wrap(value: string, maxChars: number): string[] {
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current.length > 0) lines.push(current);
    if (word.length <= maxChars) {
      current = word;
      continue;
    }
    let rest = word;
    while (rest.length > maxChars) {
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    current = rest;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

// ── Page content ────────────────────────────────────────────────────────────

function paginate(payload: ExportPayload, layout: Layout[]): string[] {
  const pages: string[] = [];
  let content = '';
  let y = PAGE_HEIGHT - MARGIN;

  // Page one: the honesty block, before any figure.
  content += textAt(MARGIN, y - TITLE_SIZE, TITLE_SIZE, FONT_BOLD, payload.reportName);
  y -= TITLE_SIZE + 10;
  content += rule(y);
  y -= LINE + 2;

  const labelWidth = 118;
  const valueChars = charsThatFit(CONTENT_WIDTH - labelWidth, NOTE_SIZE);
  for (const [label, value] of provenanceLines(payload)) {
    const lines = wrap(value, valueChars);
    content += textAt(MARGIN, y, NOTE_SIZE, FONT_BOLD, label);
    lines.forEach((line, index) => {
      content += textAt(MARGIN + labelWidth, y - index * LINE, NOTE_SIZE, FONT_REGULAR, line);
    });
    y -= LINE * lines.length + 3;
  }

  y -= 6;
  content += rule(y);
  y -= 16;

  const bottom = MARGIN + ROW_HEIGHT;
  let headerDrawn = false;

  const drawHeader = (): void => {
    content += shadedRow(y);
    for (const entry of layout) {
      content += textAt(
        entry.x + 3,
        y + 4,
        TABLE_SIZE,
        FONT_BOLD,
        clip(entry.column.label, charsThatFit(entry.width, TABLE_SIZE)),
      );
    }
    y -= ROW_HEIGHT;
    headerDrawn = true;
  };

  if (payload.rows.length === 0) {
    content += textAt(MARGIN, y, NOTE_SIZE, FONT_REGULAR, 'No activity was recorded in this window.');
    pages.push(content);
    return pages;
  }

  drawHeader();

  for (const row of payload.rows) {
    if (y < bottom) {
      pages.push(content);
      content = '';
      y = PAGE_HEIGHT - MARGIN - ROW_HEIGHT;
      headerDrawn = false;
      drawHeader();
    }
    for (const entry of layout) {
      const value = formatValue(row[entry.column.key], entry.column);
      content += textAt(
        entry.x + 3,
        y + 4,
        TABLE_SIZE,
        FONT_REGULAR,
        clip(value, charsThatFit(entry.width, TABLE_SIZE)),
      );
    }
    y -= ROW_HEIGHT;
  }

  if (!headerDrawn && content.length === 0) return pages;
  pages.push(content);
  return pages;
}

function textAt(x: number, y: number, size: number, font: string, value: string): string {
  if (value.length === 0) return '';
  return `BT ${font} ${size} Tf ${round(x)} ${round(y)} Td (${escapeText(value)}) Tj ET\n`;
}

function rule(y: number): string {
  return `0.6 G 0.7 w ${MARGIN} ${round(y)} m ${PAGE_WIDTH - MARGIN} ${round(y)} l S\n`;
}

function shadedRow(y: number): string {
  return `0.92 g ${MARGIN} ${round(y)} ${CONTENT_WIDTH} ${ROW_HEIGHT} re f 0 g\n`;
}

function round(value: number): string {
  return value.toFixed(2);
}

/**
 * PDF strings are single-byte here (WinAnsi Helvetica), so typographic punctuation
 * is transliterated to ASCII and anything else outside Latin-1 becomes a question
 * mark. A learner's name with an accent survives; an emoji does not.
 */
function escapeText(value: string): string {
  let output = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 63;
    const mapped = TRANSLITERATE[character];
    if (mapped !== undefined) {
      output += mapped;
      continue;
    }
    if (character === '(' || character === ')' || character === '\\') {
      output += `\\${character}`;
      continue;
    }
    if (code < 32) {
      output += ' ';
      continue;
    }
    output += code > 255 ? '?' : character;
  }
  return output;
}

const TRANSLITERATE: Record<string, string> = {
  '—': '-',
  '–': '-',
  '‑': '-',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '•': '-',
  '→': '->',
  '×': 'x',
};

// ── File assembly ───────────────────────────────────────────────────────────

function assemble(pages: string[]): Buffer {
  const contentPages = pages.length > 0 ? pages : [''];
  const objects: string[] = [];

  // 1 catalog, 2 page tree, 3 and 4 the two fonts; pages follow in pairs.
  const firstPageObject = 5;
  const kids = contentPages
    .map((_page, index) => `${firstPageObject + index * 2} 0 R`)
    .join(' ');

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${contentPages.length} >>`);
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  contentPages.forEach((page, index) => {
    const contentObject = firstPageObject + index * 2 + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    objects.push(`<< /Length ${page.length} >>\nstream\n${page}endstream`);
  });

  const header = '%PDF-1.4\n';
  const offsets: number[] = [];
  let body = '';
  objects.forEach((object, index) => {
    offsets.push(header.length + body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const startXref = header.length + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${startXref}\n%%EOF\n`;

  // latin1 keeps one character to one byte, which is what the xref offsets count.
  return Buffer.from(`${header}${body}${xref}${trailer}`, 'latin1');
}
