import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';

export interface SystemOptions {
  /** Verzeichnisse, in denen JARVIS Dateien lesen und schreiben darf. */
  erlaubteWurzeln: string[];
  /** Zwischenablage – in der Desktop-App wird die von Electron eingehängt. */
  clipboard?: { schreiben(text: string): void; lesen(): string };
  /** Für Tests austauschbar. */
  starter?: (befehl: string, argumente: string[]) => Promise<void>;
}

export interface DateiTreffer {
  pfad: string;
  name: string;
  groesse: number;
  geaendert: string;
}

/**
 * Zugriff auf den Rechner (§12).
 *
 * Zwei Grundsätze:
 *  1. Offizielle Wege zuerst – `xdg-open`/`open`/`start` statt Maus- und
 *     Tastatursimulation. Es gibt hier bewusst keine Bildschirmsteuerung.
 *  2. Nur, was erlaubt ist – jeder Pfad wird gegen die erlaubten Wurzeln
 *     geprüft, bevor gelesen oder geschrieben wird.
 */
export class SystemService {
  constructor(private readonly options: SystemOptions) {}

  get erlaubteWurzeln(): string[] {
    return this.options.erlaubteWurzeln.map((pfad) => resolve(pfad));
  }

  /** Wirft, wenn der Pfad außerhalb der erlaubten Bereiche liegt. */
  pruefePfad(pfad: string): string {
    const absolut = resolve(normalize(isAbsolute(pfad) ? pfad : join(homedir(), pfad)));
    const erlaubt = this.erlaubteWurzeln.some(
      (wurzel) => absolut === wurzel || absolut.startsWith(wurzel.endsWith(sep) ? wurzel : wurzel + sep)
    );
    if (!erlaubt) {
      throw new Error(
        `Zugriff auf ${absolut} ist nicht erlaubt. Freigegeben sind: ${this.erlaubteWurzeln.join(', ')}.`
      );
    }
    return absolut;
  }

  private async starte(befehl: string, argumente: string[]): Promise<void> {
    if (this.options.starter) return this.options.starter(befehl, argumente);
    await new Promise<void>((resolveP, reject) => {
      const kind = spawn(befehl, argumente, { detached: true, stdio: 'ignore' });
      kind.on('error', reject);
      kind.unref();
      resolveP();
    });
  }

  /** Öffnet eine Adresse im Standardbrowser. */
  async oeffneUrl(url: string): Promise<void> {
    const geprueft = new URL(url);
    if (!['http:', 'https:', 'mailto:'].includes(geprueft.protocol)) {
      throw new Error(`Adressen mit ${geprueft.protocol} werden nicht geöffnet.`);
    }
    await this.oeffneMitSystem(geprueft.toString());
  }

  /** Öffnet eine Datei oder einen Ordner mit dem zuständigen Programm. */
  async oeffnePfad(pfad: string): Promise<string> {
    const absolut = this.pruefePfad(pfad);
    await fs.access(absolut);
    await this.oeffneMitSystem(absolut);
    return absolut;
  }

  private async oeffneMitSystem(ziel: string): Promise<void> {
    if (process.platform === 'darwin') return this.starte('open', [ziel]);
    if (process.platform === 'win32') return this.starte('cmd', ['/c', 'start', '', ziel]);
    return this.starte('xdg-open', [ziel]);
  }

  /**
   * Startet ein Programm. Der Name wird nicht durch eine Shell geschickt,
   * sondern direkt als Programmname übergeben – damit kann in einem Namen
   * kein zusätzlicher Befehl versteckt werden.
   */
  async oeffneProgramm(name: string): Promise<void> {
    if (!/^[\w .+-]{1,64}$/.test(name)) {
      throw new Error('Ungültiger Programmname.');
    }
    if (process.platform === 'darwin') return this.starte('open', ['-a', name]);
    if (process.platform === 'win32') return this.starte('cmd', ['/c', 'start', '', name]);
    return this.starte(name, []);
  }

  async dateiLesen(pfad: string, maxZeichen = 200_000): Promise<string> {
    const absolut = this.pruefePfad(pfad);
    const inhalt = await fs.readFile(absolut, 'utf8');
    return inhalt.length > maxZeichen ? `${inhalt.slice(0, maxZeichen)}\n… (gekürzt)` : inhalt;
  }

  async dateiSchreiben(pfad: string, inhalt: string, ueberschreiben: boolean): Promise<string> {
    const absolut = this.pruefePfad(pfad);
    const existiert = await fs
      .access(absolut)
      .then(() => true)
      .catch(() => false);
    if (existiert && !ueberschreiben) {
      throw new Error(`${absolut} existiert bereits. Überschreiben ist eine freigabepflichtige Aktion.`);
    }
    await fs.mkdir(dirname(absolut), { recursive: true });
    await fs.writeFile(absolut, inhalt, 'utf8');
    return absolut;
  }

  async dateiLoeschen(pfad: string): Promise<string> {
    const absolut = this.pruefePfad(pfad);
    await fs.unlink(absolut);
    return absolut;
  }

  async dateiInfo(pfad: string): Promise<DateiTreffer> {
    const absolut = this.pruefePfad(pfad);
    const stat = await fs.stat(absolut);
    return {
      pfad: absolut,
      name: basename(absolut),
      groesse: stat.size,
      geaendert: stat.mtime.toISOString()
    };
  }

  /**
   * Sucht Dateien nach Namensbestandteil. Bewusst ohne externe Suchdienste:
   * ein begrenzter Durchlauf über die erlaubten Verzeichnisse.
   */
  async dateiSuche(
    muster: string,
    startVerzeichnis?: string,
    maxTreffer = 25,
    maxTiefe = 5
  ): Promise<DateiTreffer[]> {
    const wurzel = startVerzeichnis ? this.pruefePfad(startVerzeichnis) : this.erlaubteWurzeln[0];
    if (!wurzel) return [];
    const gesucht = muster.toLowerCase();
    const treffer: DateiTreffer[] = [];
    const ueberspringen = new Set(['node_modules', '.git', 'Library', 'AppData', '.cache', 'venv', '__pycache__']);

    const gehe = async (verzeichnis: string, tiefe: number): Promise<void> => {
      if (treffer.length >= maxTreffer || tiefe > maxTiefe) return;
      let eintraege;
      try {
        eintraege = await fs.readdir(verzeichnis, { withFileTypes: true });
      } catch {
        return; // Keine Berechtigung – überspringen statt abbrechen.
      }
      for (const eintrag of eintraege) {
        if (treffer.length >= maxTreffer) return;
        if (eintrag.name.startsWith('.') || ueberspringen.has(eintrag.name)) continue;
        const voll = join(verzeichnis, eintrag.name);
        if (eintrag.isDirectory()) {
          await gehe(voll, tiefe + 1);
          continue;
        }
        if (!eintrag.name.toLowerCase().includes(gesucht)) continue;
        try {
          const stat = await fs.stat(voll);
          treffer.push({
            pfad: voll,
            name: eintrag.name,
            groesse: stat.size,
            geaendert: stat.mtime.toISOString()
          });
        } catch {
          // Datei verschwunden – ignorieren.
        }
      }
    };

    await gehe(wurzel, 0);
    return treffer;
  }

  zwischenablageSchreiben(text: string): void {
    if (!this.options.clipboard) throw new Error('Die Zwischenablage ist in dieser Umgebung nicht verfügbar.');
    this.options.clipboard.schreiben(text);
  }

  zwischenablageLesen(): string {
    if (!this.options.clipboard) throw new Error('Die Zwischenablage ist in dieser Umgebung nicht verfügbar.');
    return this.options.clipboard.lesen();
  }

  /** Erlaubte Dateiendungen für Anhänge – ausführbare Dateien bleiben außen vor. */
  static anhangErlaubt(pfad: string): boolean {
    const erlaubt = [
      '.pdf', '.doc', '.docx', '.odt', '.xls', '.xlsx', '.ods', '.ppt', '.pptx',
      '.txt', '.md', '.csv', '.rtf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.zip'
    ];
    return erlaubt.includes(extname(pfad).toLowerCase());
  }
}
