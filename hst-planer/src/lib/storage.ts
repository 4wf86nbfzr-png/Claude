import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { ValidationError } from './errors';

/**
 * Dateiablage ausserhalb des Web-Roots (Spec 48/71/72).
 * Dateien werden NIE unter ihrem Originalnamen gespeichert – der Name landet
 * in der Datenbank, auf der Platte steht eine zufaellige ID. So kann ein
 * praeparierter Dateiname weder Pfade verlassen noch Code ausfuehren.
 */
const ROOT = path.resolve(process.env.STORAGE_PATH ?? './storage');

export const ALLOWED_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/csv': ['.csv'],
  'text/plain': ['.csv', '.txt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
}

export interface StoredFile {
  filePath: string;   // relativ zur Ablage – so bleibt sie verschiebbar
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

/** Prueft Groesse, MIME-Typ und Endung und legt die Datei ab. */
export async function storeUpload(file: File, folder: string): Promise<StoredFile> {
  const limit = maxUploadBytes();
  if (file.size === 0) throw new ValidationError('Die Datei ist leer.');
  if (file.size > limit) {
    throw new ValidationError(`Die Datei ist zu gross. Erlaubt sind bis zu ${Math.round(limit / 1024 / 1024)} MB.`);
  }

  const extension = path.extname(file.name).toLowerCase();
  const mime = file.type || 'application/octet-stream';
  const allowedExtensions = ALLOWED_MIME[mime];
  if (!allowedExtensions) {
    throw new ValidationError('Dieser Dateityp ist nicht erlaubt. Erlaubt sind PDF, XLSX, CSV, DOCX und Bilder.');
  }
  if (extension && !allowedExtensions.includes(extension)) {
    throw new ValidationError('Dateiendung und Dateityp passen nicht zusammen.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await matchesMagicBytes(buffer, mime))) {
    throw new ValidationError('Der Inhalt der Datei passt nicht zum angegebenen Dateityp.');
  }

  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '');
  const relative = path.join(safeFolder, `${randomUUID()}${extension || ''}`);
  const absolute = path.join(ROOT, relative);
  if (!absolute.startsWith(ROOT + path.sep)) throw new ValidationError('Ungueltiger Ablagepfad.');

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer, { mode: 0o640 });

  return {
    filePath: relative,
    fileName: path.basename(file.name).slice(0, 200),
    mimeType: mime,
    sizeBytes: buffer.length,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}

/** Gibt den absoluten Pfad zurueck – mit Schutz gegen Pfadausbrueche. */
export function resolveStored(relative: string): string {
  const absolute = path.resolve(ROOT, relative);
  if (absolute !== ROOT && !absolute.startsWith(ROOT + path.sep)) {
    throw new ValidationError('Ungueltiger Ablagepfad.');
  }
  return absolute;
}

export function readStored(relative: string): NodeJS.ReadableStream {
  return createReadStream(resolveStored(relative));
}

export async function removeStored(relative: string): Promise<void> {
  try {
    await unlink(resolveStored(relative));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Grobpruefung des tatsaechlichen Dateiinhalts (Spec 71). */
async function matchesMagicBytes(buffer: Buffer, mime: string): Promise<boolean> {
  const head = buffer.subarray(0, 8);
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);

  switch (mime) {
    case 'application/pdf':
      return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47);
    case 'image/webp':
      return startsWith(0x52, 0x49, 0x46, 0x46) && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel.sheet.macroEnabled.12':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return startsWith(0x50, 0x4b); // ZIP-Container
    case 'text/csv':
    case 'text/plain':
      return !buffer.subarray(0, 1024).includes(0x00); // keine Binaerdatei
    default:
      return false;
  }
}
