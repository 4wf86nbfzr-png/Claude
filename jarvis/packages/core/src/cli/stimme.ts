#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Jarvis } from '../jarvis.js';
import { LokaleErkennung, WHISPER_MODELLE, WHISPER_STANDARD } from '../voice/whisper-lokal.js';
import { PROBESATZ, spracheVomSystem, trefferquote } from '../voice/probe.js';
import { istEinstiegspunkt } from './report.js';

/**
 * Einrichtung der Spracheingabe.
 *
 *   npm run stimme
 *
 * Warum es diesen Schritt überhaupt gibt: die bequeme Erkennung des Browsers
 * (Web Speech) funktioniert in Electron nicht — Google hat den Dienst dahinter
 * auf Chrome selbst beschränkt. JARVIS bringt deshalb ein eigenes Whisper
 * mit, das auf diesem Rechner läuft. Kein Schlüssel, kein Ton, der das Gerät
 * verlässt; dafür ein einmaliger Download.
 *
 * Am Ende wird nicht behauptet, dass es geht, sondern nachgesehen: das System
 * spricht einen Probesatz, der geht durch die Erkennung, und es steht da, was
 * zurückkam.
 */

async function frageNummer(
  rl: { question: (frage: string) => Promise<string> },
  frage: string,
  max: number,
  standard: number,
): Promise<number> {
  for (let versuch = 0; versuch < 5; versuch += 1) {
    const roh = (await rl.question(frage)).trim();
    if (roh === '') return standard;
    const n = Number.parseInt(roh, 10);
    if (Number.isInteger(n) && n >= 1 && n <= max) return n;
    console.log(`  Bitte eine Zahl zwischen 1 und ${max} eingeben (oder Enter).`);
  }
  return standard;
}

function dauer(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

async function main(): Promise<void> {
  const jarvis = Jarvis.create();
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('\n  JARVIS — Spracheingabe');
  console.log('  ──────────────────────\n');
  console.log('  Die Erkennung läuft auf diesem Rechner. Kein Schlüssel nötig,');
  console.log('  und kein Ton verlässt das Gerät.\n');

  try {
    // --- 1. Modell wählen --------------------------------------------------
    const gespeichert = jarvis.repos.settings.get<string | null>('voice.stt.modell', null);
    const vorgabe = gespeichert ?? jarvis.env.JARVIS_STT_MODELL ?? WHISPER_STANDARD;

    console.log('  Welches Modell soll erkennen?\n');
    WHISPER_MODELLE.forEach((m, i) => {
      const marke = m.kennung === vorgabe ? '←' : ' ';
      console.log(`   ${i + 1}. ${m.name.padEnd(24)} ${String(m.groesseMb).padStart(5)} MB  ${marke}`);
      console.log(`      ${m.eignung}`);
    });
    const standardNr = Math.max(1, WHISPER_MODELLE.findIndex((m) => m.kennung === vorgabe) + 1);
    console.log('');
    const wahl = await frageNummer(rl, `  Nummer [${standardNr}]: `, WHISPER_MODELLE.length, standardNr);
    const modell = WHISPER_MODELLE[wahl - 1]!;

    const erkennung = new LokaleErkennung({ modell: modell.kennung, modellDir: jarvis.paths.modelDir });

    // --- 2. Laden ----------------------------------------------------------
    if (erkennung.heruntergeladen) {
      console.log(`\n  ${modell.name} liegt schon in ${jarvis.paths.modelDir}.`);
    } else {
      console.log(`\n  ${modell.name} wird geladen — etwa ${modell.groesseMb} MB.`);
      console.log('  Das dauert beim ersten Mal ein paar Minuten. Danach nie wieder.\n');
    }

    const geladen = await erkennung.laden();
    if (!geladen.ok) {
      console.log(`\n  ✗ ${geladen.error.message}`);
      if (geladen.error.hint) console.log(`    ${geladen.error.hint}`);
      if (geladen.error.code === 'NOT_CONFIGURED') {
        console.log('\n  Das Paket fehlt. Einmalig nachinstallieren:\n');
        console.log('      npm install @huggingface/transformers -w @jarvis/core\n');
      }
      process.exitCode = 1;
      return;
    }
    console.log(`  ✓ Modell bereit (${dauer(geladen.data.dauerMs)}).`);

    // --- 3. Echte Probe ----------------------------------------------------
    console.log('\n  Probe: das System spricht einen Satz, die Erkennung hört zu.\n');
    const probe = await spracheVomSystem();

    if (!probe.ok) {
      console.log(`  ⚠ Die Probe entfällt: ${probe.error.message}`);
      if (probe.error.hint) console.log(`    ${probe.error.hint}`);
      console.log('\n    Das Modell ist geladen, aber ob es hier gut versteht,');
      console.log('    zeigt sich damit erst im Gespräch.');
    } else {
      const sekunden = probe.data.pcm.length / 16_000;
      console.log(`    Gesprochen (${probe.data.werkzeug}, ${sekunden.toFixed(1)} s):`);
      console.log(`      „${PROBESATZ}"`);

      const erkannt = await erkennung.transkribiere(probe.data.pcm);
      if (!erkannt.ok) {
        console.log(`\n  ✗ Die Erkennung ist fehlgeschlagen: ${erkannt.error.message}`);
        process.exitCode = 1;
        return;
      }

      console.log(`\n    Verstanden (${dauer(erkannt.data.dauerMs)}):`);
      console.log(`      „${erkannt.data.text || '— nichts —'}"`);

      const quote = trefferquote(PROBESATZ, erkannt.data.text);
      console.log(`\n    Übereinstimmung: ${Math.round(quote * 100)} %`);

      if (quote >= 0.7) {
        console.log('    ✓ Das reicht für den Alltag.');
      } else if (quote >= 0.4) {
        console.log('    ⚠ Teilweise verstanden. Eine echte Stimme über ein Mikrofon');
        console.log('      versteht Whisper oft besser als die Computerstimme hier.');
        console.log(`      Bei Problemen ein größeres Modell wählen.`);
      } else {
        console.log('    ✗ Kaum etwas verstanden. Bitte ein größeres Modell wählen —');
        console.log('      und nicht darauf verlassen, dass es im Gespräch besser wird.');
      }

      // Rechenzeit ehrlich einordnen: unter einer halben Sekunde je Satz
      // merkt man nichts, darüber wird das Gespräch zäh.
      const faktor = erkannt.data.dauerMs / (sekunden * 1000);
      console.log(
        `    Tempo: ${faktor.toFixed(2)}× Echtzeit — ${
          faktor < 0.4
            ? 'flüssig.'
            : faktor < 1
              ? 'merklich, aber brauchbar.'
              : 'zu langsam für ein Gespräch; kleineres Modell wählen.'
        }`,
      );
    }

    // --- 4. Merken ---------------------------------------------------------
    jarvis.repos.settings.set('voice.stt.modell', modell.kennung);
    jarvis.repos.settings.set('voice.stt.anbieter', 'lokal');
    console.log(`\n  Eingetragen: ${modell.name} als Spracherkennung.`);
    console.log('  Zum Ändern einfach „npm run stimme" noch einmal ausführen.\n');
  } finally {
    rl.close();
    jarvis.close();
  }
}

if (await istEinstiegspunkt(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error('\n  Die Einrichtung ist fehlgeschlagen:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}

export { main as stimmeEinrichten };
