#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Jarvis } from '../jarvis.js';
import { EMPFOHLENE_MODELLE, OllamaAdmin } from '../llm/ollama-admin.js';
import { istEinstiegspunkt } from './report.js';

/**
 * Einrichtung eines lokalen Sprachmodells.
 *
 *   npm run modell
 *
 * Danach läuft JARVIS ohne API-Schlüssel und ohne dass ein Datum den Rechner
 * verlässt. Der Assistent prüft am Ende tatsächlich, ob das Modell Werkzeuge
 * aufrufen kann — ein Modell, das nur schön formuliert, ist hier nutzlos.
 */

function balken(anteil: number, breite = 28): string {
  const voll = Math.round(anteil * breite);
  return `[${'█'.repeat(voll)}${'·'.repeat(breite - voll)}]`;
}

function gb(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/**
 * Fragt nach einer Nummer und fragt bei Unsinn noch einmal, statt abzubrechen.
 * Wer sich vertippt, soll nicht von vorn anfangen muessen.
 */
async function frageNummer(
  rl: { question: (frage: string) => Promise<string> },
  frage: string,
  max: number,
  standard: number | null,
): Promise<number | null> {
  for (let versuch = 0; versuch < 5; versuch += 1) {
    const roh = (await rl.question(frage)).trim();
    if (roh === '') return standard;
    const n = Number.parseInt(roh, 10);
    if (Number.isInteger(n) && n >= 1 && n <= max) return n;
    console.log(`  Bitte eine Zahl zwischen 1 und ${max} eingeben${standard !== null ? ' (oder Enter)' : ''}.`);
  }
  return null;
}

async function main(): Promise<void> {
  const jarvis = Jarvis.create();
  const rl = createInterface({ input: stdin, output: stdout });
  const admin = new OllamaAdmin(jarvis.env.OLLAMA_BASE_URL);

  console.log('\n  JARVIS — lokales Sprachmodell');
  console.log('  ─────────────────────────────\n');
  console.log('  Ein lokales Modell läuft auf Ihrem Rechner: keine API-Schlüssel,');
  console.log('  keine laufenden Kosten, und Ihre Firmendaten bleiben hier.\n');

  try {
    // --- 1. Ist Ollama da? -------------------------------------------------
    const laeuft = await admin.erreichbar();
    if (!laeuft) {
      const installiert = await OllamaAdmin.installiert();
      console.log(installiert
        ? '  Ollama ist installiert, läuft aber nicht.\n'
        : '  Ollama ist noch nicht installiert.\n');
      console.log(`  ${OllamaAdmin.installationsHinweis().replace(/\n/g, '\n  ')}\n`);
      console.log('  Danach diesen Assistenten erneut starten: npm run modell\n');
      return;
    }
    console.log(`  ✓ Ollama läuft (${jarvis.env.OLLAMA_BASE_URL})\n`);

    // --- 2. Was ist schon da? ---------------------------------------------
    const vorhanden = await admin.modelle();
    if (!vorhanden.ok) {
      console.log(`  Modelle nicht abrufbar: ${vorhanden.error.message}\n`);
      return;
    }

    let gewaehlt: string | null = null;

    if (vorhanden.data.length > 0) {
      console.log('  Bereits geladen:');
      vorhanden.data.forEach((m, i) => {
        console.log(`    [${i + 1}] ${m.name.padEnd(28)} ${gb(m.groesseBytes)}`);
      });
      const n = await frageNummer(
        rl,
        '\n  Nummer wählen, oder Enter für ein neues Modell: ',
        vorhanden.data.length,
        null,
      );
      if (n !== null) gewaehlt = vorhanden.data[n - 1]!.name;
    }

    // --- 3. Neues Modell laden --------------------------------------------
    if (!gewaehlt) {
      console.log('\n  Empfohlene Modelle (alle beherrschen Werkzeugaufrufe):\n');
      EMPFOHLENE_MODELLE.forEach((m, i) => {
        console.log(`    [${i + 1}] ${m.name.padEnd(18)} ${m.groesse.padEnd(7)} RAM ${m.ram}`);
        console.log(`        ${m.eignung}`);
      });

      const nummer = await frageNummer(rl, '\n  Nummer wählen (Enter = 1): ', EMPFOHLENE_MODELLE.length, 1);
      const empfehlung = nummer === null ? undefined : EMPFOHLENE_MODELLE[nummer - 1];
      if (!empfehlung) {
        console.log('\n  Keine Auswahl getroffen. Abgebrochen.\n');
        return;
      }

      console.log(`\n  Lade ${empfehlung.name} (${empfehlung.groesse}). Das dauert je nach Leitung einige Minuten.\n`);
      let letzteZeile = '';
      const geladen = await admin.ziehe(empfehlung.name, (stand) => {
        const zeile =
          stand.anteil !== null
            ? `  ${balken(stand.anteil)} ${(stand.anteil * 100).toFixed(0).padStart(3)} %  ${stand.status}`
            : `  ${stand.status}`;
        if (zeile !== letzteZeile) {
          stdout.write(`\r${' '.repeat(letzteZeile.length)}\r${zeile}`);
          letzteZeile = zeile;
        }
      });
      stdout.write('\n\n');

      if (!geladen.ok) {
        console.log(`  Download fehlgeschlagen: ${geladen.error.message}`);
        if (geladen.error.hint) console.log(`  ↳ ${geladen.error.hint}`);
        console.log('');
        return;
      }
      gewaehlt = empfehlung.name;
      console.log(`  ✓ ${gewaehlt} geladen\n`);
    }

    // --- 4. Der eigentliche Test -------------------------------------------
    console.log(`  Prüfe, ob ${gewaehlt} Werkzeuge aufrufen kann …`);
    console.log('  (Beim ersten Aufruf lädt das Modell in den Speicher, das dauert.)\n');

    const pruefung = await admin.pruefeWerkzeugtauglichkeit(gewaehlt);
    if (!pruefung.ok) {
      console.log(`  Prüfung fehlgeschlagen: ${pruefung.error.message}\n`);
      return;
    }

    const p = pruefung.data;
    console.log(`  Werkzeugaufruf:   ${p.ruftWerkzeugeAuf ? '✓ ja' : '✗ nein'}`);
    console.log(`  Argumente:        ${p.argumenteKorrekt ? '✓ korrekt' : '✗ falsch'}`);
    console.log(`  Dauer:            ${(p.dauerMs / 1000).toFixed(1)} s`);
    if (p.stattdessen) console.log(`  Antwortete mit:   „${p.stattdessen.replace(/\n/g, ' ')}"`);
    console.log(`\n  ${p.urteil}\n`);

    if (!p.ruftWerkzeugeAuf) {
      console.log('  Dieses Modell wird nicht eingetragen. Bitte ein anderes wählen —');
      console.log('  qwen3:8b und qwen2.5:14b sind hier zuverlässig.\n');
      return;
    }

    // --- 5. Eintragen -------------------------------------------------------
    const uebernehmen = (await rl.question('  Als Sprachmodell für JARVIS eintragen? [J/n] ')).trim().toLowerCase();
    if (uebernehmen === 'n' || uebernehmen === 'nein') {
      console.log('  Nicht eingetragen.\n');
      return;
    }

    jarvis.repos.settings.set('llm.provider', 'ollama');
    jarvis.repos.settings.set('llm.model', gewaehlt);
    jarvis.audit.log({
      actor: 'benutzer',
      action: 'einstellung.sprachmodell',
      summary: `Sprachmodell umgestellt auf lokales Modell ${gewaehlt} (Ollama)`,
    });

    console.log(`\n  ✓ Eingetragen: ${gewaehlt} über Ollama.`);
    if ((process.env.JARVIS_LLM_PROVIDER ?? '') !== '') {
      console.log('\n  Achtung: In Ihrer Umgebung ist JARVIS_LLM_PROVIDER gesetzt.');
      console.log('  Die Umgebungsvariable hat Vorrang — bitte dort entfernen oder auf');
      console.log('  "ollama" setzen, sonst greift diese Einstellung nicht.');
    }
    console.log('\n  Starten mit: npm start\n');
  } finally {
    rl.close();
    jarvis.close();
  }
}

if (await istEinstiegspunkt(import.meta.url)) {
  await main().catch((e: unknown) => {
    console.error(`\n  Fehler: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
}
