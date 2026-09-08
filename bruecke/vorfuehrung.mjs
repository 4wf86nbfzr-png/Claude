#!/usr/bin/env node
/* ============================================================
   Vorfuehrung — alles einmal in echt, ohne Risiko
   ------------------------------------------------------------
   Startet drei Dinge auf diesem Rechner:

     1. ein secplan-Doppel (eine nachgebaute Planungsanwendung)
     2. die Bruecke, auf dieses Doppel gerichtet
     3. dazu die Beispieldateien

   Damit laesst sich die ganze Kette durchspielen — Abgleichliste
   laden, Zeiten einlesen, freigeben, und die Zeiten landen
   wirklich im Tagesplan. Nur eben nicht im echten secplan.

   Zum Ueben, zum Vorfuehren, und als Probe nach jeder Aenderung.

       npm run vorfuehrung
   ============================================================ */
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { HIER } from './konfig.mjs';
import { starten, schichtenAnlegen } from './test/scheinplan.mjs';

const PORT_SECPLAN = 8791;
const PORT_BRUECKE = 8771;          // nicht 8770 — die echte Bruecke darf weiterlaufen
const ORDNER = path.join(HIER, 'daten-vorfuehrung');
const KONFIG = path.join(HIER, 'konfig-vorfuehrung.json');

const schichten = schichtenAnlegen();
const { server } = await starten(PORT_SECPLAN, schichten);

await rm(ORDNER, { recursive: true, force: true });
await mkdir(ORDNER, { recursive: true });

await writeFile(KONFIG, JSON.stringify({
  port: PORT_BRUECKE,
  host: '127.0.0.1',
  modus: 'browser',
  probelauf: false,
  morgenlauf: '99:99',              // in der Vorfuehrung nichts von selbst
  ordner: { daten: 'daten-vorfuehrung', eingang: 'daten-vorfuehrung/eingang',
            ausgang: 'daten-vorfuehrung/ausgang' },
  secplan: {
    adresse: `http://127.0.0.1:${PORT_SECPLAN}/`,
    planAdresse: `http://127.0.0.1:${PORT_SECPLAN}/tagesplan?d={datum}`,
    browserPfad: process.env.HST_BROWSER || '',
    wartenMs: 300, nurAenderungen: true, abgleichKlicken: true
  },
  mail: { aktiv: false, an: [] }
}, null, 2), 'utf8');

const dienst = spawn(process.execPath, [path.join(HIER, 'server.mjs')], {
  cwd: HIER,
  env: { ...process.env, HST_KONFIG: KONFIG, SECPLAN_BENUTZER: 'buero', SECPLAN_PASSWORT: 'geheim' },
  stdio: ['ignore', 'pipe', 'pipe']
});
dienst.stdout.on('data', (d) => process.stdout.write(String(d)));
dienst.stderr.on('data', (d) => {
  const t = String(d);
  if (!/Deprecation|trace-deprecation/.test(t)) process.stderr.write(t);
});

await new Promise((f) => setTimeout(f, 2000));

const token = existsSync(path.join(ORDNER, 'token.txt'))
  ? (await import('node:fs')).readFileSync(path.join(ORDNER, 'token.txt'), 'utf8').trim() : '';

const linie = '  ' + '─'.repeat(66);
console.log('');
console.log('  VORFUEHRUNG — nichts hiervon beruehrt das echte secplan');
console.log(linie);
console.log('  Abgleich oeffnen:');
console.log(`      http://127.0.0.1:${PORT_BRUECKE}/intern/abgleich.html?t=${token}`);
console.log('');
console.log('  Das secplan-Doppel zum Nachsehen (Anmeldung: buero / geheim):');
console.log(`      http://127.0.0.1:${PORT_SECPLAN}/tagesplan?d=2026-09-08`);
console.log(linie);
console.log('  So geht die Vorfuehrung:');
console.log('');
console.log('   1. Unter 01 die Datei ablegen:');
console.log('        bruecke/beispiel/abgleichliste-beispiel.pdf');
console.log('      -> 8 offene Schichten, zwei Tage. Unten "Di. 08.09.2026" waehlen.');
console.log('');
console.log('   2. Unter 02 die Zeitliste ablegen:');
console.log('        bruecke/beispiel/stundenzettel-beispiel.csv');
console.log('      -> 8 Zeilen. Beachten Sie Ruth Kuehn-Adler: sie steht zweimal');
console.log('         auf dem Zettel (KS und ML) und wird zu einer Schicht.');
console.log('');
console.log('   3. Im Abgleich stehen jetzt:');
console.log('        3x passt        (nichts zu tun)');
console.log('        3x Abweichung   (ansehen, uebernehmen)');
console.log('        1x offen        Kilian Brandt hat nicht abgezeichnet');
console.log('        1x Name unklar  Timo Renner stand nicht im Plan');
console.log('');
console.log('   4. Ausprobieren:');
console.log('        "Diktat" -> Zeile tippen: Terzic bis dreiundzwanzig Uhr');
console.log('        "Abweichungen bis +/- 15 min uebernehmen"');
console.log('        Kilian Brandt: "war da, wie geplant" oder "Ausfall"');
console.log('        Timo Renner: im Feld die richtige Person waehlen');
console.log('');
console.log('   5. Namen oben rechts eintragen, dann "Freigeben & nach secplan".');
console.log('      Danach im Doppel nachsehen: die Zeiten stehen dort und die');
console.log('      Schichten sind als abgeglichen markiert.');
console.log('');
console.log('   6. "Protokoll" aufklappen — jede Aenderung steht drin.');
console.log(linie);
console.log('  Beenden mit Strg+C. Alles Erzeugte liegt in daten-vorfuehrung/');
console.log('  und kann geloescht werden.');
console.log('');

for (const zeichen of ['SIGINT', 'SIGTERM']) {
  process.on(zeichen, async () => {
    console.log('\n  Vorfuehrung beendet. Stand im secplan-Doppel:');
    for (const s of schichten.filter((x) => x.datum === '2026-09-08')) {
      console.log(`    ${s.name.padEnd(24)} ${s.von}-${s.bis}  ${s.abgeglichen ? 'abgeglichen' : 'offen'}`);
    }
    dienst.kill();
    server.close();
    process.exit(0);
  });
}
