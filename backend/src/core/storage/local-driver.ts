// ─────────────────────────────────────────────────────────────────────────────
// Local filesystem storage driver
// Writes under `env.storage.localDir`. Suitable for a single VPS running one PM2
// process, which is the deployment this project targets.
//
// Two safety properties matter here and are enforced rather than assumed:
//  - The generated key never contains any client-supplied path segment, so a
//    file named `../../etc/passwd` cannot escape the storage root.
//  - Every read resolves the final path and checks it is still inside the root
//    before opening it, which stops a malformed key stored earlier from being
//    used as a traversal primitive.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../../config/env';
import { notFound } from '../http/errors';
import { logger } from '../logger';
import type { PutObjectInput, StorageDriver, StoredObject } from './storage.types';

const log = logger.child({ module: 'storage:local' });

/** Extensions we are willing to write to disk, keyed by MIME type. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.weba',
  'audio/mp4': '.m4a',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogv',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/** Only `a-z0-9/_-` survive, so a prefix can never introduce `..` or a drive. */
function safePrefix(prefix: string): string {
  return prefix
    .split('/')
    .map((segment) => segment.replace(/[^A-Za-z0-9_-]/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/');
}

function extensionFor(mimeType: string, fileName: string): string {
  const known = EXTENSION_BY_MIME[mimeType];
  if (known) return known;
  const fromName = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(fromName) ? fromName : '.bin';
}

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';

  private readonly root: string;

  constructor(root: string = env.storage.localDir) {
    this.root = path.resolve(root);
  }

  /** Creates the storage root. Called once during server startup. */
  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    log.info({ root: this.root }, 'local storage ready');
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const prefix = safePrefix(input.prefix);
    const extension = extensionFor(input.mimeType, input.fileName);
    // The stored name is entirely generated: 16 random bytes plus a vetted
    // extension. The original name is kept on the database row instead.
    const objectName = `${Date.now().toString(36)}-${crypto.randomBytes(16).toString('hex')}${extension}`;
    const storageKey = prefix ? `${prefix}/${objectName}` : objectName;

    const absolutePath = this.resolveKey(storageKey);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, input.content);

    return {
      storageKey,
      byteSize: input.content.byteLength,
      mimeType: input.mimeType,
      checksumSha256: crypto.createHash('sha256').update(input.content).digest('hex'),
    };
  }

  async get(storageKey: string): Promise<Buffer> {
    const absolutePath = this.resolveKey(storageKey);
    try {
      return await fs.readFile(absolutePath);
    } catch {
      throw notFound('File');
    }
  }

  async stream(storageKey: string): Promise<Readable> {
    const absolutePath = this.resolveKey(storageKey);
    if (!(await this.exists(storageKey))) throw notFound('File');
    return createReadStream(absolutePath);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const stats = await fs.stat(this.resolveKey(storageKey));
      return stats.isFile();
    } catch {
      return false;
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(storageKey));
    } catch (error) {
      // Removing an object that is already gone is the desired end state.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }

  async usage(prefix: string): Promise<number> {
    const directory = path.join(this.root, safePrefix(prefix));
    return this.directorySize(directory);
  }

  private async directorySize(directory: string): Promise<number> {
    let total = 0;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        total += await this.directorySize(entryPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryPath);
        total += stats.size;
      }
    }
    return total;
  }

  /**
   * Turns a stored key into an absolute path, refusing anything that would land
   * outside the storage root.
   */
  private resolveKey(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
    const absolutePath = path.resolve(this.root, normalized);
    const rootWithSeparator = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (absolutePath !== this.root && !absolutePath.startsWith(rootWithSeparator)) {
      // Reaching here means a key was tampered with or written by older code.
      log.error({ storageKey }, 'rejected storage key outside the storage root');
      throw notFound('File');
    }
    return absolutePath;
  }
}
