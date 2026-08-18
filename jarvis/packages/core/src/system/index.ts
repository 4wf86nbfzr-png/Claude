import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { err, fromException, ok, type Result } from '../util/result.js';
import { truncate } from '../util/text.js';
import type { Logger } from '../util/logger.js';
import { bekannteProgramme, istUnbedenklicherName, startbefehle } from './apps.js';

/**
 * Zugriff auf den Rechner.
 *
 * Grundsaetze aus dem Pflichtenheft, hier umgesetzt:
 *  - Offizielle Wege zuerst: Programme werden ueber den Standardoeffner des
 *    Betriebssystems gestartet, Webseiten ueber den Standardbrowser. Es gibt
 *    bewusst keine Maus- oder Tastatursteuerung.
 *  - Least Privilege: Dateizugriffe finden nur innerhalb freigegebener
 *    Wurzelverzeichnisse statt. Alles ausserhalb wird abgelehnt.
 *  - Schreibende und loeschende Aktionen laufen ueber die Approval-Engine;
 *    dieser Dienst stellt dafuer nur die Ausfuehrung bereit.
 */

export interface ClipboardBridge {
  readText(): string;
  writeText(text: string): void;
}

export interface SystemServiceOptions {
  /** Verzeichnisse, in denen gelesen/geschrieben werden darf. */
  allowedRoots: string[];
  logger: Logger;
  clipboard?: ClipboardBridge | null;
  /** Nur fuer Tests: Prozessstart abfangen. */
  launcher?: (command: string, args: string[]) => Promise<Result<{ befehl: string }>>;
}

export interface FileHit {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  isDirectory: boolean;
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.yaml', '.yml', '.xml', '.html', '.htm',
  '.css', '.js', '.ts', '.tsx', '.jsx', '.py', '.rb', '.java', '.c', '.h', '.cpp', '.sql', '.log',
  '.ini', '.conf', '.env', '.eml', '.vtt', '.srt',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'Library', 'AppData', 'Windows', 'System32', '.Trash', 'venv', '.venv', 'dist', 'build']);

export class SystemService {
  private allowedRoots: string[];
  private readonly logger: Logger;
  private clipboardBridge: ClipboardBridge | null;
  private readonly launcher: (command: string, args: string[]) => Promise<Result<{ befehl: string }>>;

  constructor(options: SystemServiceOptions) {
    this.allowedRoots = options.allowedRoots.map((r) => resolve(r));
    this.logger = options.logger;
    this.clipboardBridge = options.clipboard ?? null;
    this.launcher = options.launcher ?? defaultLauncher;
  }

  get roots(): string[] {
    return [...this.allowedRoots];
  }

  /** Programmnamen, die JARVIS ohne Umweg versteht. */
  get bekannteProgramme(): string[] {
    return bekannteProgramme();
  }

  /**
   * Ersetzt die freigegebenen Verzeichnisse.
   * Nur ueber die Einrichtung aufrufen -- ein Agent darf sich seinen
   * eigenen Zugriff nicht erweitern.
   */
  setRoots(pfade: string[]): void {
    this.allowedRoots = pfade.map((r) => resolve(r));
    this.logger.warn('Freigegebene Verzeichnisse geändert', { anzahl: this.allowedRoots.length });
  }

  setClipboard(bridge: ClipboardBridge | null): void {
    this.clipboardBridge = bridge;
  }

  // --- Pfadsicherheit -----------------------------------------------------

  /** Liegt der Pfad in einem freigegebenen Verzeichnis? */
  resolveSafePath(input: string): Result<string> {
    const expanded = input.startsWith('~') ? join(homedir(), input.slice(1)) : input;
    const abs = isAbsolute(expanded) ? resolve(expanded) : resolve(homedir(), expanded);

    const erlaubt = this.allowedRoots.some((root) => {
      const rel = relative(root, abs);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    });
    if (!erlaubt) {
      return err('PERMISSION_DENIED', `Der Pfad "${abs}" liegt außerhalb der freigegebenen Verzeichnisse.`, {
        hint: `Freigegeben sind: ${this.allowedRoots.join(', ')}`,
      });
    }
    return ok(abs);
  }

  // --- Programme und Adressen --------------------------------------------

  /** Oeffnet eine Webadresse im Standardbrowser. */
  async openUrl(url: string): Promise<Result<{ url: string }>> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return err('INVALID_INPUT', `"${url}" ist keine gültige Adresse.`);
    }
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return err('PERMISSION_DENIED', `Das Schema ${parsed.protocol} wird nicht geöffnet — erlaubt sind http, https und mailto.`);
    }
    const r = await this.openWithDefaultHandler(parsed.toString());
    return r.ok ? ok({ url: parsed.toString() }) : r;
  }

  /** Oeffnet eine Datei oder einen Ordner mit dem Standardprogramm. */
  async openPath(path: string): Promise<Result<{ path: string }>> {
    const safe = this.resolveSafePath(path);
    if (!safe.ok) return safe;
    try {
      await access(safe.data, constants.F_OK);
    } catch {
      return err('NOT_FOUND', `"${safe.data}" existiert nicht.`);
    }
    const r = await this.openWithDefaultHandler(safe.data);
    return r.ok ? ok({ path: safe.data }) : r;
  }

  /**
   * Startet ein Programm. Kein beliebiger Shell-Aufruf: der Name wird als
   * Anwendung an den Systemoeffner uebergeben, Argumente werden nicht
   * durch eine Shell interpretiert.
   */
  async openApplication(name: string): Promise<Result<{ programm: string; gestartetAls: string }>> {
    const clean = name.trim();
    if (!istUnbedenklicherName(clean)) {
      return err('INVALID_INPUT', 'Der Programmname enthält unzulässige Zeichen.');
    }

    const os = platform();
    const kandidaten = startbefehle(clean, os === 'darwin' || os === 'win32' ? os : 'linux');

    // Der Reihe nach probieren: „Browser" kann Chrome, Firefox oder Safari
    // heissen -- wir nehmen den ersten, der wirklich startet.
    const fehler: string[] = [];
    for (const kandidat of kandidaten) {
      const result = await this.launcher(kandidat.befehl, kandidat.args);
      if (result.ok) {
        this.logger.info('Programm gestartet', { angefragt: clean, gestartet: kandidat.anzeige });
        return ok({ programm: clean, gestartetAls: kandidat.anzeige });
      }
      fehler.push(`${kandidat.anzeige}: ${result.error.message}`);
    }

    return err('NOT_FOUND', `"${clean}" ließ sich nicht starten.`, {
      hint:
        kandidaten.length > 1
          ? `Probiert wurde: ${kandidaten.map((k) => k.anzeige).join(', ')}. Ist eines davon installiert?`
          : 'Ist der Programmname korrekt geschrieben und das Programm installiert?',
      detail: { versuche: fehler },
    });
  }

  private async openWithDefaultHandler(target: string): Promise<Result<{ befehl: string }>> {
    const os = platform();
    if (os === 'darwin') return this.launcher('open', [target]);
    if (os === 'win32') return this.launcher('cmd', ['/c', 'start', '', target]);
    return this.launcher('xdg-open', [target]);
  }

  // --- Dateien ------------------------------------------------------------

  async searchFiles(input: { query: string; root?: string; limit?: number; maxDepth?: number }): Promise<Result<FileHit[]>> {
    const rootResult = input.root ? this.resolveSafePath(input.root) : ok(this.allowedRoots[0] ?? homedir());
    if (!rootResult.ok) return rootResult;

    const needle = input.query.trim().toLowerCase();
    if (!needle) return err('INVALID_INPUT', 'Es fehlt ein Suchbegriff.');

    const limit = Math.min(input.limit ?? 40, 200);
    const maxDepth = Math.min(input.maxDepth ?? 6, 12);
    const hits: FileHit[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (hits.length >= limit || depth > maxDepth) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return; // Kein Zugriff -- stillschweigend ueberspringen.
      }
      for (const entry of entries) {
        if (hits.length >= limit) return;
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          await walk(full, depth + 1);
          continue;
        }
        if (!entry.name.toLowerCase().includes(needle)) continue;
        try {
          const s = await stat(full);
          hits.push({
            path: full,
            name: entry.name,
            sizeBytes: s.size,
            modifiedAt: s.mtime.toISOString(),
            isDirectory: false,
          });
        } catch {
          continue;
        }
      }
    };

    await walk(rootResult.data, 0);
    hits.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return ok(hits);
  }

  async readTextFile(path: string, maxChars = 20_000): Promise<Result<{ path: string; inhalt: string; gekuerzt: boolean }>> {
    const safe = this.resolveSafePath(path);
    if (!safe.ok) return safe;
    const ext = extname(safe.data).toLowerCase();
    if (ext && !TEXT_EXTENSIONS.has(ext)) {
      return err('INVALID_INPUT', `${ext}-Dateien werden nicht als Text gelesen.`, {
        hint: `Lesbar sind unter anderem: ${[...TEXT_EXTENSIONS].slice(0, 12).join(', ')}`,
      });
    }
    try {
      const s = await stat(safe.data);
      if (s.size > 5_000_000) return err('INVALID_INPUT', 'Die Datei ist größer als 5 MB und wird nicht gelesen.');
      const inhalt = await readFile(safe.data, 'utf8');
      return ok({
        path: safe.data,
        inhalt: truncate(inhalt, maxChars),
        gekuerzt: inhalt.length > maxChars,
      });
    } catch (e) {
      return fromException(e, 'NOT_FOUND');
    }
  }

  async fileExists(path: string): Promise<boolean> {
    const safe = this.resolveSafePath(path);
    if (!safe.ok) return false;
    try {
      await access(safe.data, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Schreibt eine Datei. Ueberschreiben braucht eine Freigabe (siehe tools/files.ts). */
  async writeTextFile(path: string, content: string): Promise<Result<{ path: string; bytes: number }>> {
    const safe = this.resolveSafePath(path);
    if (!safe.ok) return safe;
    try {
      await mkdir(dirname(safe.data), { recursive: true });
      await writeFile(safe.data, content, 'utf8');
      this.logger.info('Datei geschrieben', { path: safe.data, bytes: Buffer.byteLength(content) });
      return ok({ path: safe.data, bytes: Buffer.byteLength(content) });
    } catch (e) {
      return fromException(e);
    }
  }

  /** Loescht eine Datei. Nur nach Freigabe aufrufen. */
  async deleteFile(path: string): Promise<Result<{ path: string }>> {
    const safe = this.resolveSafePath(path);
    if (!safe.ok) return safe;
    try {
      const s = await stat(safe.data);
      if (s.isDirectory()) {
        return err('PERMISSION_DENIED', 'Ganze Ordner werden nicht gelöscht — nur einzelne Dateien.');
      }
      await unlink(safe.data);
      this.logger.warn('Datei gelöscht', { path: safe.data });
      return ok({ path: safe.data });
    } catch (e) {
      return fromException(e, 'NOT_FOUND');
    }
  }

  // --- Zwischenablage -----------------------------------------------------

  readClipboard(): Result<{ text: string }> {
    if (!this.clipboardBridge) {
      return err('NOT_IMPLEMENTED', 'Die Zwischenablage ist nur in der Desktop-App verfügbar.');
    }
    try {
      return ok({ text: this.clipboardBridge.readText() });
    } catch (e) {
      return fromException(e);
    }
  }

  writeClipboard(text: string): Result<{ zeichen: number }> {
    if (!this.clipboardBridge) {
      return err('NOT_IMPLEMENTED', 'Die Zwischenablage ist nur in der Desktop-App verfügbar.');
    }
    try {
      this.clipboardBridge.writeText(text);
      return ok({ zeichen: text.length });
    } catch (e) {
      return fromException(e);
    }
  }
}

/**
 * Startet einen Prozess ohne Shell. `shell: false` ist hier entscheidend:
 * damit koennen Argumente keine Befehlsverkettung ausloesen.
 */
async function defaultLauncher(command: string, args: string[]): Promise<Result<{ befehl: string }>> {
  return new Promise((resolvePromise) => {
    try {
      const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: false });
      let entschieden = false;

      child.on('error', (e) => {
        if (entschieden) return;
        entschieden = true;
        resolvePromise(err('NOT_FOUND', e.message));
      });

      child.unref();
      // Kein Warten auf das Ende: das Programm laeuft weiter, wir nicht.
      setTimeout(() => {
        if (entschieden) return;
        entschieden = true;
        resolvePromise(ok({ befehl: [command, ...args].join(' ') }));
      }, 250);
    } catch (e) {
      resolvePromise(fromException(e));
    }
  });
}

/** Standardmaessig freigegebene Wurzelverzeichnisse. */
export function defaultAllowedRoots(dataDir: string): string[] {
  const home = homedir();
  return [
    join(home, 'Desktop'),
    join(home, 'Documents'),
    join(home, 'Dokumente'),
    join(home, 'Downloads'),
    join(home, 'Schreibtisch'),
    dataDir,
  ].filter((p) => p.split(sep).length > 1);
}
