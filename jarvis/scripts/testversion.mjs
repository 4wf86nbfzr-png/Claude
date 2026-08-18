#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ein Befehl, um JARVIS auszuprobieren.
 *
 *   npm run testversion
 *
 * Der Sinn ist nicht Bequemlichkeit, sondern Ehrlichkeit: JARVIS braucht zwei
 * Dinge, die nicht im Projekt liegen — ein Sprachmodell zum Denken und ein
 * Erkennungsmodell zum Zuhören. Beides sind Downloads im Gigabyte-Bereich.
 * Dieses Skript sagt vorher, was fehlt, wie groß es ist und was es tut, und
 * fragt dann. Es lädt nichts hinter dem Rücken.
 *
 * Was es NICHT ist: ein Installer. Es baut kein .dmg und installiert nichts
 * ins System. Es macht das Projekt startklar und startet es.
 */

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATEN = process.env.JARVIS_DATA_DIR ?? join(homedir(), '.jarvis');

const farbe = {
  aus: '[0m',
  matt: '[2m',
  fett: '[1m',
};

const zeile = (text = '') => console.log(text);
const schritt = (text) => zeile(`\n${farbe.fett}${text}${farbe.aus}`);
const ja = (text) => zeile(`  ✓ ${text}`);
const nein = (text) => zeile(`  ✗ ${text}`);
const warn = (text) => zeile(`  ⚠ ${text}`);
const matt = (text) => zeile(`${farbe.matt}${text}${farbe.aus}`);

function laufen(befehl, argumente, optionen = {}) {
  const r = spawnSync(befehl, argumente, { cwd: WURZEL, encoding: 'utf8', ...optionen });
  return { code: r.status ?? 1, aus: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function vorhanden(befehl) {
  return laufen(process.platform === 'win32' ? 'where' : 'which', [befehl]).code === 0;
}

/** Läuft schon ein Ollama-Dienst? */
async function ollamaLaeuft() {
  const url = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
  try {
    const antwort = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!antwort.ok) return null;
    const daten = await antwort.json();
    return (daten.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

/** Liegt ein Whisper-Modell für die Erkennung auf der Platte? */
function whisperDa() {
  const ordner = join(DATEN, 'modelle', 'onnx-community');
  if (!existsSync(ordner)) return null;
  const treffer = readdirSync(ordner).filter((n) => n.startsWith('whisper'));
  return treffer.length > 0 ? treffer : null;
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  /**
   * Fragt nach. Ist die Eingabe zu Ende (Strg-D, oder das Skript hängt an
   * einer Pipe), gibt es null statt eines Absturzes -- der Aufrufer bricht
   * dann sauber ab, statt einen Stacktrace zu zeigen.
   */
  const frage = async (text) => {
    try {
      return (await rl.question(text)).trim().toLowerCase();
    } catch {
      return null;
    }
  };
  const jaNein = async (text) => {
    const antwort = await frage(`${text} [J/n] `);
    if (antwort === null) {
      zeile('\n  Abgebrochen.');
      return false;
    }
    return antwort === '' || antwort.startsWith('j') || antwort.startsWith('y');
  };

  try {
    zeile(`\n  ${farbe.fett}JARVIS — Testversion${farbe.aus}`);
    zeile('  ────────────────────');
    matt('  Prüft, was zum Ausprobieren fehlt, und startet dann.\n');

    // --- Node --------------------------------------------------------------
    schritt('1. Node');
    const [gross, klein] = process.versions.node.split('.').map(Number);
    if (gross > 20 || (gross === 20 && klein >= 11)) {
      ja(`Node ${process.versions.node}`);
    } else {
      nein(`Node ${process.versions.node} — gebraucht wird 20.11 oder neuer.`);
      matt('    Auf dem Mac: brew install node   (oder von nodejs.org)');
      return;
    }

    // --- Pakete ------------------------------------------------------------
    schritt('2. Pakete');
    if (existsSync(join(WURZEL, 'node_modules', 'electron'))) {
      ja('Abhängigkeiten sind installiert.');
    } else {
      warn('Die Abhängigkeiten fehlen (rund 700 MB, überwiegend Electron).');
      if (!(await jaNein('    Jetzt installieren?'))) return;
      const r = laufen('npm', ['install'], { stdio: 'inherit' });
      if (r.code !== 0) {
        nein('npm install ist fehlgeschlagen. Siehe Ausgabe oben.');
        return;
      }
      ja('Installiert.');
    }

    // --- Sprachmodell ------------------------------------------------------
    schritt('3. Sprachmodell (das Denken)');
    const schluessel = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (schluessel) {
      ja('Ein API-Schlüssel ist gesetzt — damit denkt JARVIS in der Cloud.');
    } else {
      const modelle = await ollamaLaeuft();
      if (modelle === null) {
        nein('Kein Ollama erreichbar und kein API-Schlüssel gesetzt.');
        matt('    Ohne Sprachmodell versteht JARVIS keine Anweisung.\n');
        if (!vorhanden('ollama')) {
          matt('    Ollama ist nicht installiert. Auf dem Mac:');
          matt('        brew install ollama        (oder ollama.com/download)');
          matt('    Danach in einem zweiten Fenster:  ollama serve\n');
        } else {
          matt('    Ollama ist da, läuft aber nicht. In einem zweiten Fenster:');
          matt('        ollama serve\n');
        }
        matt('    Anschließend hier weiter mit:  npm run modell');
        return;
      }
      if (modelle.length === 0) {
        warn('Ollama läuft, hat aber noch kein Modell.');
        matt('    Der Assistent lädt eines und prüft, ob es Werkzeuge aufrufen kann:');
        if (await jaNein('    Jetzt einrichten? (Download rund 5 GB)')) {
          laufen('npm', ['run', 'modell'], { stdio: 'inherit' });
        } else {
          return;
        }
      } else {
        ja(`Ollama läuft mit: ${modelle.slice(0, 3).join(', ')}`);
        matt('    Ob das Modell auch Werkzeuge aufrufen kann, prüft „npm run modell".');
      }
    }

    // --- Spracherkennung ---------------------------------------------------
    schritt('4. Spracherkennung (das Zuhören)');
    const whisper = whisperDa();
    if (whisper) {
      ja(`Whisper liegt bereit: ${whisper.join(', ')}`);
    } else {
      warn('Noch kein Erkennungsmodell.');
      matt('    Ohne das können Sie tippen, aber nicht sprechen. Die Erkennung');
      matt('    des Browsers scheidet aus: Google beschränkt sie auf Chrome selbst,');
      matt('    in Electron liefert sie nur einen Netzwerkfehler.\n');
      if (await jaNein('    Jetzt einrichten? (Download rund 490 MB, mit Selbsttest)')) {
        laufen('npm', ['run', 'stimme'], { stdio: 'inherit' });
      } else {
        matt('    Übersprungen — Sprache bleibt vorerst aus. Nachholen: npm run stimme');
      }
    }

    // --- Mikrofon auf dem Mac ----------------------------------------------
    if (process.platform === 'darwin') {
      schritt('5. Mikrofon');
      matt('    Beim ersten Schnipsen fragt macOS nach dem Mikrofon. Ohne dieses');
      matt('    „Erlauben" bleibt JARVIS taub — nachträglich unter');
      matt('    Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon.');
    }

    // --- Los ---------------------------------------------------------------
    schritt('Bereit');
    matt('    Der erste Start baut die Oberfläche — das dauert einen Moment.');
    matt('    Alle Daten landen in ' + DATEN);
    zeile('');
    if (!(await jaNein('  JARVIS jetzt starten?'))) {
      matt('\n  Später von Hand:  npm start\n');
      return;
    }

    rl.close();
    const kind = spawn('npm', ['start'], { cwd: WURZEL, stdio: 'inherit' });
    kind.on('exit', (code) => process.exit(code ?? 0));
    return;
  } finally {
    rl.close();
  }
}

await main();
