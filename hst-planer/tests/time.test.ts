import { describe, expect, it } from 'vitest';
import {
  formatDiff, formatMinutes, minutesToHours, normalizeTime, parseGermanDate,
  parseTimeToMinutes, shiftDuration, shiftMinutes, timeDiffMinutes, isoDate,
} from '@/lib/time';

describe('parseTimeToMinutes', () => {
  it('liest uebliche Schreibweisen', () => {
    expect(parseTimeToMinutes('17:00')).toBe(1020);
    expect(parseTimeToMinutes('17.00')).toBe(1020);
    expect(parseTimeToMinutes('17')).toBe(1020);
    expect(parseTimeToMinutes('17:00 Uhr')).toBe(1020);
    expect(parseTimeToMinutes('08:30')).toBe(510);
    expect(parseTimeToMinutes('1730')).toBe(1050);
    expect(parseTimeToMinutes('08:30:00')).toBe(510);
  });

  it('liest Excel-Uhrzeiten als Tagesbruchteil', () => {
    expect(parseTimeToMinutes(0.75)).toBe(1080); // 18:00
    expect(parseTimeToMinutes(0.5)).toBe(720);
  });

  it('verweigert Unsinn', () => {
    expect(parseTimeToMinutes('')).toBeNull();
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(parseTimeToMinutes('17:99')).toBeNull();
    expect(parseTimeToMinutes('Feierabend')).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
  });
});

describe('Nachtschichten (Spec 69)', () => {
  it('rechnet 18:00 bis 02:00 als 8 Stunden', () => {
    expect(shiftMinutes('18:00', '02:00')).toBe(480);
  });

  it('zieht die Pause ab, ohne negativ zu werden', () => {
    expect(shiftMinutes('18:00', '02:00', 30)).toBe(450);
    expect(shiftMinutes('18:00', '18:30', 60)).toBe(0);
  });

  it('markiert den Tageswechsel', () => {
    expect(shiftDuration('17:00', '01:00')?.overnight).toBe(true);
    expect(shiftDuration('09:00', '17:00')?.overnight).toBe(false);
  });

  it('zaehlt gleiche Zeiten nur auf Wunsch als ganzen Tag', () => {
    expect(shiftDuration('06:00', '06:00')?.netMinutes).toBe(0);
    expect(shiftDuration('06:00', '06:00', 0, { treatEqualAsFullDay: true })?.netMinutes).toBe(1440);
  });
});

describe('timeDiffMinutes', () => {
  it('bleibt im Fenster von zwoelf Stunden', () => {
    expect(timeDiffMinutes('17:00', '17:05')).toBe(5);
    expect(timeDiffMinutes('17:00', '16:55')).toBe(-5);
    // Planung 23:55, Ist 00:10 -> +15 Minuten, nicht -1425
    expect(timeDiffMinutes('23:55', '00:10')).toBe(15);
    expect(timeDiffMinutes('00:10', '23:55')).toBe(-15);
  });
});

describe('Formatierung', () => {
  it('formatiert Differenzen lesbar', () => {
    expect(formatDiff(30)).toBe('+30 Min');
    expect(formatDiff(-5)).toBe('-5 Min');
    expect(formatDiff(0)).toBe('0 Min');
    expect(formatDiff(65)).toBe('+1:05 h');
    expect(formatDiff(null)).toBe('–');
  });

  it('rechnet Minuten in Dezimalstunden', () => {
    expect(minutesToHours(450)).toBe(7.5);
    expect(minutesToHours(485)).toBe(8.08);
  });

  it('normalisiert Uhrzeiten', () => {
    expect(normalizeTime('8')).toBe('08:00');
    expect(formatMinutes(1440)).toBe('00:00');
  });
});

describe('parseGermanDate', () => {
  const reference = new Date('2026-09-24T00:00:00Z');

  it('liest deutsche und ISO-Formate', () => {
    expect(isoDate(parseGermanDate('15.10.2026')!)).toBe('2026-10-15');
    expect(isoDate(parseGermanDate('2026-10-15')!)).toBe('2026-10-15');
    expect(isoDate(parseGermanDate('15. Oktober 2026')!)).toBe('2026-10-15');
    expect(isoDate(parseGermanDate('01.02.26')!)).toBe('2026-02-01');
  });

  it('ergaenzt ein fehlendes Jahr mit dem naechsten Vorkommen', () => {
    expect(isoDate(parseGermanDate('15.10.', reference)!)).toBe('2026-10-15');
    // Ein Datum deutlich in der Vergangenheit meint das Folgejahr.
    expect(isoDate(parseGermanDate('15.01.', reference)!)).toBe('2027-01-15');
  });

  it('liest Excel-Seriennummern', () => {
    expect(isoDate(parseGermanDate(46310)!)).toBe('2026-10-15');
  });

  it('weist unmoegliche Datumsangaben zurueck', () => {
    expect(parseGermanDate('32.13.2026')).toBeNull();
    expect(parseGermanDate('')).toBeNull();
  });
});
