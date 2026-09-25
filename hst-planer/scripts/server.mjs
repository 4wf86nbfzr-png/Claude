/**
 * Startet den HST Planer als Server – in einem Aufruf.
 *
 *   node scripts/server.mjs              alles: prüfen, bauen, migrieren, starten
 *   node scripts/server.mjs --nur-start  nur starten (nichts bauen, nicht migrieren)
 *   node scripts/server.mjs --ohne-migration
 *
 * Warum es dieses Skript gibt: `next build` erzeugt mit `output: 'standalone'`
 * einen eigenständigen Server unter .next/standalone – aber ohne die statischen
 * Dateien und ohne public/. Wer die nicht daneben kopiert, bekommt eine Seite
 * ohne Stile. `next start` wiederum warnt bei dieser Einstellung ausdrücklich,
 * dass es der falsche Weg ist. Beides ist leicht zu übersehen und genau einmal
 * im Jahr zu debuggen. Hier passiert es von selbst.
 *
 * Vor dem Start wird geprüft, was ohne aussagekräftige Meldung sonst erst
 * mitten im Betrieb auffällt: fehlende Geheimnisse, eine nicht erreichbare
 * Datenbank, ausstehende Migrationen.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const WURZEL = path.resolve(import.meta.dirname, '..');
const STANDALONE = path.join(WURZEL, '.next', 'standalone');
const ARGV = process.argv.slice(2);
const NUR_START = ARGV.includes('--nur-start');
const OHNE_MIGRATION = NUR_START || ARGV.includes('--ohne-migration');

function sagen(text) { console.log(`[Server] ${text}`); }
function abbrechen(text, rat) {
  console.error(`\n[Server] ${text}`);
  if (rat) console.error(`         ${rat}`);
  process.exit(1);
}

/* ------------------------------------------------------------- Umgebung */

async function umgebungLaden() {
  const datei = path.join(WURZEL, '.env');
  if (!existsSync(datei)) {
    abbrechen('Keine .env gefunden.', 'Vorlage: cp .env.beispiel .env – und die Werte eintragen.');
  }
  const { config } = await import('dotenv');
  config({ path: datei, quiet: true });
}

function geheimnissePruefen() {
  const fehlt = [];
  if (!process.env.DATABASE_URL) fehlt.push('DATABASE_URL');
  if (!process.env.AUTH_SECRET) fehlt.push('AUTH_SECRET');
  if (fehlt.length) {
    abbrechen(`In der .env fehlt: ${fehlt.join(', ')}.`,
      'AUTH_SECRET erzeugen mit: openssl rand -base64 48');
  }
  /* Zu kurze Schlüssel fallen sonst erst beim ersten Anmeldeversuch auf –
     mit einer Meldung, die niemandem sagt, woran es liegt. */
  if ((process.env.AUTH_SECRET ?? '').length < 32) {
    abbrechen('AUTH_SECRET ist kürzer als 32 Zeichen.',
      'Neu erzeugen mit: openssl rand -base64 48');
  }
  if (process.env.NODE_ENV !== 'production') process.env.NODE_ENV = 'production';
}

/* ------------------------------------------------------------ Datenbank */

function datenbankAdresse() {
  try {
    const url = new URL(process.env.DATABASE_URL);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch {
    abbrechen('DATABASE_URL lässt sich nicht lesen.',
      'Erwartet wird: postgresql://benutzer:passwort@host:5432/datenbank?schema=public');
  }
}

function erreichbar({ host, port }, msWarten) {
  return new Promise((fertig) => {
    const verbindung = createConnection({ host, port });
    const schliessen = (ok) => { verbindung.destroy(); fertig(ok); };
    verbindung.setTimeout(msWarten);
    verbindung.once('connect', () => schliessen(true));
    verbindung.once('timeout', () => schliessen(false));
    verbindung.once('error', () => schliessen(false));
  });
}

async function aufDatenbankWarten() {
  const adresse = datenbankAdresse();
  /* Beim Start zusammen mit der Datenbank (Docker, systemd) ist sie ein paar
     Sekunden lang noch nicht da. Einmal fehlschlagen und aufgeben wäre hier
     das Falsche – aber ewig warten auch. */
  for (let versuch = 1; versuch <= 30; versuch += 1) {
    if (await erreichbar(adresse, 2000)) {
      sagen(`Datenbank erreichbar (${adresse.host}:${adresse.port}).`);
      return;
    }
    if (versuch === 1) sagen(`Warte auf die Datenbank (${adresse.host}:${adresse.port}) …`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  abbrechen(`Die Datenbank unter ${adresse.host}:${adresse.port} antwortet nicht.`,
    'Läuft PostgreSQL? Stimmt DATABASE_URL? Mit Docker: docker compose up -d datenbank');
}

function laufen(befehl, argumente, was) {
  const ergebnis = spawnSync(befehl, argumente, { cwd: WURZEL, stdio: 'inherit', env: process.env });
  if (ergebnis.status !== 0) abbrechen(`${was} ist fehlgeschlagen.`);
}

/* ---------------------------------------------------------------- Bauen */

/** Neuester Änderungszeitpunkt unterhalb eines Verzeichnisses. */
async function juengsteAenderung(ordner) {
  const { readdir } = await import('node:fs/promises');
  let neuste = 0;
  async function durch(ort) {
    for (const eintrag of await readdir(ort, { withFileTypes: true })) {
      if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue;
      const voll = path.join(ort, eintrag.name);
      if (eintrag.isDirectory()) { await durch(voll); continue; }
      const info = await stat(voll);
      if (info.mtimeMs > neuste) neuste = info.mtimeMs;
    }
  }
  await durch(ordner);
  return neuste;
}

async function bauenFallsNoetig() {
  const server = path.join(STANDALONE, 'server.js');
  if (!existsSync(server)) {
    sagen('Kein fertiger Build vorhanden – wird jetzt gebaut.');
    laufen('npm', ['run', 'build'], 'Der Build');
    return;
  }
  const gebaut = (await stat(server)).mtimeMs;
  const quelle = Math.max(
    await juengsteAenderung(path.join(WURZEL, 'src')),
    await juengsteAenderung(path.join(WURZEL, 'prisma')),
    (await stat(path.join(WURZEL, 'package.json'))).mtimeMs,
  );
  if (quelle > gebaut) {
    sagen('Der Quellcode ist neuer als der Build – wird neu gebaut.');
    laufen('npm', ['run', 'build'], 'Der Build');
  } else {
    sagen('Build ist aktuell.');
  }
}

/**
 * Die standalone-Ausgabe enthält den Server und seine Pakete, aber weder die
 * statischen Dateien noch public/. Ohne sie lädt die Seite ohne Stile und ohne
 * Logo – deshalb liegen sie hier daneben, bevor gestartet wird.
 */
async function statischesDaneben() {
  const statisch = path.join(WURZEL, '.next', 'static');
  if (existsSync(statisch)) {
    await mkdir(path.join(STANDALONE, '.next'), { recursive: true });
    await cp(statisch, path.join(STANDALONE, '.next', 'static'), { recursive: true, force: true });
  }
  const oeffentlich = path.join(WURZEL, 'public');
  if (existsSync(oeffentlich)) {
    await cp(oeffentlich, path.join(STANDALONE, 'public'), { recursive: true, force: true });
  }
}

/* --------------------------------------------------------------- Ablage */

async function ablagePruefen() {
  const ort = process.env.STORAGE_PATH ?? path.join(WURZEL, 'storage');
  await mkdir(ort, { recursive: true });
  sagen(`Dateiablage: ${ort}`);
}

/* --------------------------------------------------------------- Start */

async function starten() {
  const port = process.env.PORT ?? '3000';
  const server = path.join(STANDALONE, 'server.js');
  if (!existsSync(server)) {
    abbrechen('Es gibt keinen fertigen Build.', 'Einmal ohne --nur-start starten, dann wird gebaut.');
  }
  await statischesDaneben();
  sagen(`Start: http://localhost:${port}`);
  /* APP_URL ist die Adresse, unter der die Anwendung von aussen erreichbar sein
     soll – hinter einem Proxy eine ganz andere als der eigene Port. Deshalb
     getrennt ausgeben und nicht als „läuft unter" verkaufen. */
  if (process.env.APP_URL) sagen(`Öffentliche Adresse laut .env: ${process.env.APP_URL}`);

  const kind = spawn(process.execPath, [server], {
    cwd: STANDALONE,
    stdio: 'inherit',
    env: { ...process.env, PORT: port, HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0' },
  });
  /* Ein Signal an dieses Skript muss beim Server ankommen, sonst bleibt beim
     Neustart eines Dienstes ein Prozess auf dem Port stehen. */
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { kind.kill(signal); });
  }
  kind.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
}

async function main() {
  await umgebungLaden();
  geheimnissePruefen();
  const paket = JSON.parse(await readFile(path.join(WURZEL, 'package.json'), 'utf8'));
  sagen(`${paket.name} ${paket.version}`);

  if (!NUR_START) {
    await aufDatenbankWarten();
    if (!OHNE_MIGRATION) {
      sagen('Migrationen einspielen …');
      laufen('npx', ['prisma', 'migrate', 'deploy'], 'Die Migration');
    }
    await bauenFallsNoetig();
  }
  await ablagePruefen();
  await starten();
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });
