/**
 * A small CSV reader for the admin import screens.
 *
 * What a school actually has in hand is an export from its old system, so this
 * copes with what those contain: quoted fields, commas and doubled quotes inside
 * quotes, CRLF line endings, a byte-order mark and blank lines. It does not try
 * to guess a delimiter other than a comma.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  rows.push(row);

  return rows.filter((cells) => cells.some((cell) => cell !== ''));
}

/**
 * Reads a CSV with a header row into objects keyed by normalised column name
 * ("First name" becomes `firstname`). `aliases` maps each wanted key to the
 * header spellings a real export might use.
 */
export function readCsvRecords<K extends string>(
  text: string,
  aliases: Record<K, readonly string[]>,
): { records: Partial<Record<K, string>>[]; missingColumns: K[] } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { records: [], missingColumns: Object.keys(aliases) as K[] };

  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const header = rows[0].map(normalise);
  const indexFor = {} as Record<K, number>;
  const missingColumns: K[] = [];
  for (const key of Object.keys(aliases) as K[]) {
    const spellings = [key, ...aliases[key]].map(normalise);
    const index = header.findIndex((cell) => spellings.includes(cell));
    indexFor[key] = index;
    if (index === -1) missingColumns.push(key);
  }

  const records = rows.slice(1).map((cells) => {
    const record: Partial<Record<K, string>> = {};
    for (const key of Object.keys(aliases) as K[]) {
      const index = indexFor[key];
      if (index >= 0 && cells[index] !== undefined && cells[index] !== '') record[key] = cells[index];
    }
    return record;
  });

  return { records, missingColumns };
}
