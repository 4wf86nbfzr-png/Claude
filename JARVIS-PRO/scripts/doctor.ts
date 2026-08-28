/**
 * `pnpm doctor` - Bestandsaufnahme des Rechners.
 *
 * Rein lesend. Loescht nichts, aendert nichts, installiert nichts. Gibt nur
 * maskierte Werte aus: keine Rufnummer, kein Token, keine PIN.
 *
 * Der Bericht ist so gebaut, dass er sich gefahrlos weitergeben laesst.
 */
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { arch, cpus, freemem, homedir, platform, release, totalmem } from 'node:os';
import { promisify } from 'node:util';
import { loadDotEnv } from '../apps/orchestrator/src/config.js';

const exec = promisify(execFile);

type Status = 'ok' | 'warnung' | 'fehlt' | 'info';

interface Finding {
  readonly bereich: string;
  readonly name: string;
  readonly status: Status;
  readonly wert: string;
  readonly hinweis?: string;
}

const findings: Finding[] = [];
const add = (f: Finding): void => {
  findings.push(f);
};

async function version(cmd: string, args: string[] = ['--version']): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(cmd, args);
    const out = (stdout || stderr).split('\n')[0]?.trim() ?? '';
    return out.length > 0 ? out : 'vorhanden';
  } catch {
    return null;
  }
}

async function checkSystem(): Promise<void> {
  const isMac = platform() === 'darwin';
  const isAppleSilicon = isMac && arch() === 'arm64';

  add({
    bereich: 'System',
    name: 'Plattform',
    status: 'info',
    wert: `${platform()} ${release()} (${arch()})`,
  });

  if (isMac) {
    const sw = await version('sw_vers', ['-productVersion']);
    add({
      bereich: 'System',
      name: 'macOS-Version',
      status: sw === null ? 'warnung' : 'ok',
      wert: sw ?? 'nicht ermittelbar',
    });
    add({
      bereich: 'System',
      name: 'Prozessor',
      status: 'info',
      wert: isAppleSilicon ? 'Apple Silicon (Metal fuer whisper.cpp moeglich)' : 'Intel (kein Metal)',
    });
  } else if (platform() === 'linux') {
    add({
      bereich: 'System',
      name: 'Hinweis',
      status: 'info',
      wert: 'Linux erkannt - das ist der 24/7-Host, nicht der Entwicklungsrechner.',
    });
  }

  add({ bereich: 'System', name: 'CPU-Kerne', status: 'info', wert: String(cpus().length) });
  add({
    bereich: 'System',
    name: 'Arbeitsspeicher',
    status: totalmem() < 8 * 1024 ** 3 ? 'warnung' : 'ok',
    wert: `${(totalmem() / 1024 ** 3).toFixed(1)} GB gesamt, ${(freemem() / 1024 ** 3).toFixed(1)} GB frei`,
    ...(totalmem() < 8 * 1024 ** 3
      ? { hinweis: 'Unter 8 GB wird whisper.cpp mit dem medium-Modell eng.' }
      : {}),
  });

  try {
    const { statfsSync } = await import('node:fs');
    const s = statfsSync('.');
    const freeGb = (s.bavail * s.bsize) / 1024 ** 3;
    add({
      bereich: 'System',
      name: 'Freier Speicherplatz',
      status: freeGb < 10 ? 'warnung' : 'ok',
      wert: `${freeGb.toFixed(1)} GB`,
      ...(freeGb < 10 ? { hinweis: 'Die Sprachmodelle brauchen mehrere GB.' } : {}),
    });
  } catch {
    /* nicht ueberall verfuegbar */
  }
}

async function checkToolchain(): Promise<void> {
  const tools: { cmd: string; args?: string[]; pflicht: boolean; zweck: string }[] = [
    { cmd: 'node', pflicht: true, zweck: 'Laufzeit' },
    { cmd: 'pnpm', pflicht: true, zweck: 'Paketverwaltung' },
    { cmd: 'git', pflicht: true, zweck: 'Versionsverwaltung' },
    { cmd: 'python3', pflicht: false, zweck: 'Hilfsskripte' },
    { cmd: 'cmake', pflicht: true, zweck: 'Bau von whisper.cpp' },
    { cmd: 'make', pflicht: true, zweck: 'Bau von whisper.cpp' },
    { cmd: 'ffmpeg', pflicht: false, zweck: 'Audio-Konvertierung fuer Benchmarks' },
    { cmd: 'sqlite3', pflicht: false, zweck: 'Datenbank von Hand ansehen' },
    { cmd: 'asterisk', args: ['-V'], pflicht: false, zweck: 'Telefonanlage' },
    { cmd: 'brew', pflicht: false, zweck: 'Paketquelle unter macOS' },
    { cmd: 'docker', pflicht: false, zweck: 'Asterisk im Container' },
  ];

  for (const t of tools) {
    const v = await version(t.cmd, t.args);
    add({
      bereich: 'Werkzeuge',
      name: t.cmd,
      status: v !== null ? 'ok' : t.pflicht ? 'fehlt' : 'warnung',
      wert: v ?? 'nicht gefunden',
      ...(v === null ? { hinweis: `wird gebraucht fuer: ${t.zweck}` } : {}),
    });
  }

  // Node-Version genauer pruefen: node:sqlite gibt es erst ab 22.13.
  const major = Number(process.versions.node.split('.')[0] ?? 0);
  const minor = Number(process.versions.node.split('.')[1] ?? 0);
  const sqliteOk = major > 22 || (major === 22 && minor >= 13);
  add({
    bereich: 'Werkzeuge',
    name: 'node:sqlite verfuegbar',
    status: sqliteOk ? 'ok' : 'fehlt',
    wert: sqliteOk ? `Node ${process.versions.node}` : `Node ${process.versions.node} ist zu alt`,
    ...(sqliteOk ? {} : { hinweis: 'Node 22.13 oder neuer wird gebraucht.' }),
  });
}

function checkSpeechAssets(env: Record<string, string>): void {
  const entries: { key: string; name: string; zweck: string }[] = [
    { key: 'WHISPER_BIN', name: 'whisper.cpp-Programm', zweck: 'Spracherkennung' },
    { key: 'WHISPER_MODEL', name: 'whisper-Modell', zweck: 'Spracherkennung' },
    { key: 'PIPER_BIN', name: 'Piper-Programm', zweck: 'Sprachausgabe' },
    { key: 'PIPER_VOICE', name: 'Piper-Stimme', zweck: 'Sprachausgabe' },
  ];

  for (const e of entries) {
    const path = env[e.key] ?? process.env[e.key] ?? '';
    if (path.length === 0) {
      add({
        bereich: 'Sprache',
        name: e.name,
        status: 'fehlt',
        wert: `${e.key} ist nicht gesetzt`,
        hinweis: `wird gebraucht fuer: ${e.zweck}. "pnpm setup" richtet das ein.`,
      });
      continue;
    }
    if (!existsSync(path)) {
      add({
        bereich: 'Sprache',
        name: e.name,
        status: 'fehlt',
        wert: 'Pfad zeigt ins Leere',
        hinweis: 'Der in der Konfiguration eingetragene Pfad existiert nicht.',
      });
      continue;
    }
    const size = statSync(path).size;
    add({
      bereich: 'Sprache',
      name: e.name,
      status: 'ok',
      wert: `vorhanden (${(size / 1024 ** 2).toFixed(0)} MB)`,
    });
  }
}

function checkConfig(env: Record<string, string>, mitTelefon: boolean): void {
  const get = (k: string): string => env[k] ?? process.env[k] ?? '';

  add({
    bereich: 'Konfiguration',
    name: '.env vorhanden',
    status: existsSync('.env') ? 'ok' : 'warnung',
    wert: existsSync('.env') ? 'ja' : 'nein - .env.example kopieren',
  });

  const mode = get('JARVIS_MODE') || 'simulation';
  add({
    bereich: 'Konfiguration',
    name: 'Betriebsmodus',
    status: 'info',
    wert: mode,
    ...(mode === 'live' ? { hinweis: 'Im Live-Betrieb wird tatsaechlich gesendet und angerufen.' } : {}),
  });

  // Rufnummern nur maskiert - und nur, wenn der Weg sie braucht.
  if (mitTelefon) {
    for (const [key, name] of [
      ['JARVIS_OWNER_PHONE_E164', 'Rufnummer Noah'],
      ['JARVIS_SIM_PHONE_E164', 'Rufnummer Jarvis-SIM'],
    ] as const) {
      const v = get(key);
      add({
        bereich: 'Konfiguration',
        name,
        status: /^\+[1-9]\d{6,14}$/.test(v) ? 'ok' : 'fehlt',
        wert: v.length > 6 ? `${v.slice(0, 4)}***${v.slice(-3)}` : 'nicht gesetzt',
      });
    }
  } else {
    const wa = get('JARVIS_OWNER_WA_ID');
    add({
      bereich: 'Konfiguration',
      name: 'Eigene WhatsApp-Nummer',
      status: wa.replace(/\D/g, '').length >= 8 ? 'ok' : 'fehlt',
      wert: wa.length > 6 ? `${wa.slice(0, 4)}***${wa.slice(-3)}` : 'nicht gesetzt',
      ...(wa.length > 0
        ? {}
        : { hinweis: 'JARVIS_OWNER_WA_ID - nur von dieser Nummer nimmt Jarvis Anweisungen an.' }),
    });

    const faktor = get('JARVIS_CHAT_SECOND_FACTOR') || 'pin';
    add({
      bereich: 'Konfiguration',
      name: 'Zweiter Faktor im Chat',
      status: 'info',
      wert: faktor,
      ...(faktor === 'pin'
        ? {
            hinweis:
              'Eine getippte PIN bleibt im Chatverlauf stehen. "totp" waere staerker - siehe docs/whatsapp-weg.md.',
          }
        : {}),
    });
  }

  add({
    bereich: 'Datenschutz',
    name: 'STORE_RAW_AUDIO',
    status: get('STORE_RAW_AUDIO') === 'true' ? 'fehlt' : 'ok',
    wert: get('STORE_RAW_AUDIO') === 'true' ? 'true - das ist NICHT zulaessig' : 'false',
    ...(get('STORE_RAW_AUDIO') === 'true'
      ? { hinweis: 'Roh-Audio darf nicht gespeichert werden. Der Code erzwingt false in Produktion.' }
      : {}),
  });

  add({
    bereich: 'Datenschutz',
    name: 'Datenbankverschluesselung',
    status: get('JARVIS_DB_CIPHER') === 'true' ? 'ok' : 'warnung',
    wert: get('JARVIS_DB_CIPHER') === 'true' ? 'eingeschaltet' : 'aus',
    ...(get('JARVIS_DB_CIPHER') === 'true'
      ? {}
      : { hinweis: 'Fuer echte personenbezogene Daten einschalten (im Live-Betrieb Pflicht).' }),
  });

  // Kennungen: nur ob gesetzt, nie der Wert.
  for (const [key, name] of [
    ['MS_CLIENT_ID', 'Microsoft-App-Kennung'],
    ['WHATSAPP_PHONE_NUMBER_ID', 'WhatsApp-Nummern-Kennung'],
    ['WHATSAPP_WABA_ID', 'WhatsApp-Konto-Kennung'],
    ['ANTHROPIC_API_KEY', 'Anthropic-Schluessel'],
  ] as const) {
    add({
      bereich: 'Konfiguration',
      name,
      status: get(key).length > 0 ? 'ok' : 'warnung',
      wert: get(key).length > 0 ? 'gesetzt' : 'nicht gesetzt',
    });
  }
}

function checkSecretsInGit(): void {
  const gitignore = existsSync('.gitignore');
  add({
    bereich: 'Sicherheit',
    name: '.gitignore vorhanden',
    status: gitignore ? 'ok' : 'fehlt',
    wert: gitignore ? 'ja' : 'nein',
  });

  const envTracked = existsSync('.env');
  if (envTracked) {
    add({
      bereich: 'Sicherheit',
      name: '.env nicht im Git',
      status: 'info',
      wert: 'Bitte mit "git check-ignore .env" bestaetigen',
    });
  }
}

async function checkExisting(): Promise<void> {
  // Rein lesende Bestandsaufnahme moeglicher Altstaende.
  const candidates = [
    `${homedir()}/Jarvis`,
    `${homedir()}/jarvis`,
    `${homedir()}/whisper.cpp`,
    `${homedir()}/piper`,
  ];
  const found = candidates.filter((p) => existsSync(p));
  add({
    bereich: 'Bestand',
    name: 'Alte Ordner',
    status: found.length === 0 ? 'ok' : 'info',
    wert: found.length === 0 ? 'keine gefunden' : found.join(', '),
    ...(found.length > 0
      ? { hinweis: 'Nichts davon wird angefasst. Vor Aenderungen bitte sichern.' }
      : {}),
  });
}

function render(): void {
  const symbol: Record<Status, string> = { ok: '  ok  ', warnung: ' warn ', fehlt: 'FEHLT ', info: ' info ' };
  let bereich = '';

  console.log('\nJarvis Pro - Diagnose\n');
  console.log('Alle Werte sind maskiert. Dieser Bericht enthaelt keine Geheimnisse.\n');

  for (const f of findings) {
    if (f.bereich !== bereich) {
      bereich = f.bereich;
      console.log(`\n${bereich}`);
      console.log('-'.repeat(bereich.length));
    }
    console.log(`[${symbol[f.status]}] ${f.name.padEnd(28)} ${f.wert}`);
    if (f.hinweis !== undefined) console.log(`${' '.repeat(11)}  -> ${f.hinweis}`);
  }

  const fehlt = findings.filter((f) => f.status === 'fehlt').length;
  const warn = findings.filter((f) => f.status === 'warnung').length;

  console.log('\n' + '='.repeat(60));
  if (fehlt === 0 && warn === 0) {
    console.log('Alles bereit.');
  } else {
    console.log(`${fehlt} Punkte fehlen, ${warn} Punkte sind auffaellig.`);
    console.log('Was zu tun ist, steht jeweils daneben. "pnpm setup" erledigt das meiste.');
  }
  console.log('='.repeat(60) + '\n');

  process.exitCode = fehlt > 0 ? 1 : 0;
}

async function main(): Promise<void> {
  const env = loadDotEnv();
  // Was ueberhaupt gebraucht wird, haengt am Bedienweg. Beim Chatweg gibt es
  // weder Spracherkennung noch Sprachausgabe - sie als "fehlt" zu melden
  // schickt einen auf einen Weg, den man gar nicht gehen will.
  const kanal = (env['JARVIS_KANAL'] ?? process.env['JARVIS_KANAL'] ?? 'beide').trim();
  const mitTelefon = kanal === 'telefon' || kanal === 'beide';

  add({
    bereich: 'Konfiguration',
    name: 'Bedienweg',
    status: 'info',
    wert: kanal,
    ...(mitTelefon
      ? {}
      : { hinweis: 'Reiner Chatbetrieb: Sprachschicht, Asterisk und Rufnummern entfallen.' }),
  });

  await checkSystem();
  if (mitTelefon) await checkToolchain();
  if (mitTelefon) checkSpeechAssets(env);
  checkConfig(env, mitTelefon);
  checkSecretsInGit();
  await checkExisting();
  render();
}

void main();
