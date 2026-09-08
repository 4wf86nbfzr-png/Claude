/* Die Einrichtung: aus einer Tagesplan-Adresse wird eine Vorlage,
   und die Probe sagt, ob dort ueberhaupt Schichten stehen. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseZurVorlage } from '../einrichten.mjs';

test('Datum in der Adresse wird zum Platzhalter', () => {
  assert.deepEqual(adresseZurVorlage('https://x.de/plan?tag=2026-09-08'),
    { vorlage: 'https://x.de/plan?tag={datum}', datum: '2026-09-08' });

  assert.deepEqual(adresseZurVorlage('https://x.de/plan/08.09.2026'),
    { vorlage: 'https://x.de/plan/{datum_de}', datum: '08.09.2026' });

  assert.deepEqual(adresseZurVorlage('https://x.de/plan?d=20260908'),
    { vorlage: 'https://x.de/plan?d={datum_kompakt}', datum: '2026-09-08' });

  // Ohne Datum bleibt die Adresse, wie sie ist — dann merkt sich
  // secplan den Tag selbst, oder es wird von Hand nachgetragen.
  assert.deepEqual(adresseZurVorlage('https://x.de/tagesplan'),
    { vorlage: 'https://x.de/tagesplan', datum: null });
});
