// ─────────────────────────────────────────────────────────────────────────────
// Minimal ZIP writer
// An .xlsx file is a ZIP archive of XML parts, so exporting a spreadsheet needs a
// ZIP writer and nothing else. Writing those ~120 bytes of header format here
// keeps a spreadsheet dependency out of package.json entirely, which matters for a
// deployment target where every added package is another thing to audit and
// another thing that can break a VPS install.
//
// This is a deliberately small subset of the format: no encryption, no ZIP64, no
// directory entries, no multi-disk. That is all an export needs.
// ─────────────────────────────────────────────────────────────────────────────

import { deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** Path inside the archive, forward slashes, no leading slash. */
  name: string;
  data: Buffer;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const METHOD_DEFLATE = 8;
const VERSION = 20;

/** Files below this size are not worth compressing. */
const DEFLATE_MIN_BYTES = 64;
const METHOD_STORE = 0;

const CRC_TABLE = buildCrcTable();

export function zipSync(entries: ZipEntry[], modified = new Date()): Buffer {
  const { time, date } = dosTimestamp(modified);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const store = entry.data.length < DEFLATE_MIN_BYTES;
    const body = store ? entry.data : deflateRawSync(entry.data);
    const method = store ? METHOD_STORE : METHOD_DEFLATE;
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralBlock = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBlock.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBlock, end]);
}

function buildCrcTable(): Int32Array {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
}

export function crc32(data: Buffer): number {
  let crc = -1;
  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ data[index]) & 0xff]);
  }
  return (crc ^ -1) >>> 0;
}

/** ZIP keeps timestamps in the 1980-epoch MS-DOS format. */
function dosTimestamp(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}
