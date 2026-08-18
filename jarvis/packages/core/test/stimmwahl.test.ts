import { describe, expect, it } from 'vitest';
import {
  bessereStimmeVerfuegbar,
  bewerteStimme,
  waehleStimme,
  type StimmenEintrag,
} from '../src/voice/stimmwahl.js';

/**
 * Die Stimmenauswahl.
 *
 * Die Liste unten ist der Bestand, den macOS tatsächlich meldet — inklusive
 * der Spaßstimmen, die dort gleichberechtigt danebenstehen. Genau deshalb gibt
 * es diese Auswahl: greift man einfach die erste deutsche Stimme, landet man
 * mit einiger Wahrscheinlichkeit bei „Bahh".
 */
const macOS: StimmenEintrag[] = [
  { name: 'Albert', lang: 'en-US', localService: true },
  { name: 'Anna', lang: 'de-DE', localService: true, default: true },
  { name: 'Bahh', lang: 'de-DE', localService: true },
  { name: 'Eddy (Deutsch (Deutschland))', lang: 'de-DE', localService: true },
  { name: 'Grandma (Deutsch (Deutschland))', lang: 'de-DE', localService: true },
  { name: 'Helena', lang: 'de-DE', localService: true },
  { name: 'Markus', lang: 'de-DE', localService: true },
  { name: 'Petra (Premium)', lang: 'de-DE', localService: true },
  { name: 'Samantha', lang: 'en-US', localService: true },
];

describe('waehleStimme', () => {
  it('nimmt die hochwertige Fassung vor der Standardstimme', () => {
    expect(waehleStimme(macOS)?.name).toBe('Petra (Premium)');
  });

  it('meidet die Spaßstimmen, auch wenn sie deutsch sind', () => {
    const nurSpass: StimmenEintrag[] = [
      { name: 'Bahh', lang: 'de-DE' },
      { name: 'Eddy (Deutsch (Deutschland))', lang: 'de-DE' },
      { name: 'Anna', lang: 'de-DE' },
    ];
    expect(waehleStimme(nurSpass)?.name).toBe('Anna');
  });

  it('bevorzugt Siri vor Premium', () => {
    const mitSiri = [...macOS, { name: 'Siri Stimme 4 (Deutsch (Deutschland))', lang: 'de-DE', localService: true }];
    expect(waehleStimme(mitSiri)?.name).toContain('Siri');
  });

  it('folgt einem ausdrücklichen Wunsch, auch gegen die Bewertung', () => {
    expect(waehleStimme(macOS, { wunsch: 'Markus' })?.name).toBe('Markus');
    expect(waehleStimme(macOS, { wunsch: 'Bahh' })?.name).toBe('Bahh');
  });

  it('ignoriert einen Wunsch, den es nicht gibt, und wählt selbst', () => {
    expect(waehleStimme(macOS, { wunsch: 'Gibtsnicht' })?.name).toBe('Petra (Premium)');
  });

  it('nimmt keine Stimme in einer fremden Sprache', () => {
    const nurEnglisch: StimmenEintrag[] = [{ name: 'Samantha (Premium)', lang: 'en-US' }];
    expect(waehleStimme(nurEnglisch)).toBeNull();
  });

  it('zieht das genaue Land der bloßen Sprache vor', () => {
    const beides: StimmenEintrag[] = [
      { name: 'Wien', lang: 'de-AT', localService: true },
      { name: 'Berlin', lang: 'de-DE', localService: true },
    ];
    expect(waehleStimme(beides, { sprache: 'de-DE' })?.name).toBe('Berlin');
  });

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(waehleStimme([])).toBeNull();
  });

  it('wertet die kompakte Fassung ab', () => {
    const a = bewerteStimme({ name: 'Anna', lang: 'de-DE' });
    const b = bewerteStimme({ name: 'Anna (Kompakt)', lang: 'de-DE' });
    expect(a).toBeGreaterThan(b);
  });
});

describe('bessereStimmeVerfuegbar', () => {
  it('rät zum Nachladen, wenn nur die Standardstimmen da sind', () => {
    const schlicht: StimmenEintrag[] = [
      { name: 'Anna', lang: 'de-DE' },
      { name: 'Markus', lang: 'de-DE' },
    ];
    expect(bessereStimmeVerfuegbar(schlicht)).toBe(true);
  });

  it('schweigt, wenn schon eine gute Stimme installiert ist', () => {
    expect(bessereStimmeVerfuegbar(macOS)).toBe(false);
  });

  it('schweigt, wenn es gar keine deutsche Stimme gibt — da hilft der Rat nicht', () => {
    expect(bessereStimmeVerfuegbar([{ name: 'Samantha', lang: 'en-US' }])).toBe(false);
  });
});
