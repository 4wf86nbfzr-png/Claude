import { describe, expect, it } from 'vitest';
import { readName, suggestMapping, normalizeHeader } from '@/lib/import/columns';
import { detectDelimiter, parseCsv, parseSpreadsheet, parseXlsx, splitCsvLine, ImportError } from '@/lib/import/sheet';

describe('Spaltenerkennung (Spec 24)', () => {
  it('erkennt deutsche Standardspalten', () => {
    const { mapping, missingRequired } = suggestMapping(['Mitarbeiter', 'Datum', 'Beginn', 'Ende', 'Pause', 'Event']);
    expect(mapping.name).toBe('Mitarbeiter');
    expect(mapping.date).toBe('Datum');
    expect(mapping.start).toBe('Beginn');
    expect(mapping.end).toBe('Ende');
    expect(mapping.break).toBe('Pause');
    expect(mapping.event).toBe('Event');
    expect(missingRequired).toEqual([]);
  });

  it('erkennt getrennte Vor- und Nachnamen', () => {
    const { mapping, missingRequired } = suggestMapping(['Nachname', 'Vorname', 'Datum', 'Von', 'Bis']);
    expect(mapping.lastName).toBe('Nachname');
    expect(mapping.firstName).toBe('Vorname');
    expect(mapping.start).toBe('Von');
    expect(mapping.end).toBe('Bis');
    expect(missingRequired).toEqual([]);
  });

  it('erkennt Spalten mit Zusaetzen', () => {
    const { mapping } = suggestMapping(['Name des Mitarbeiters', 'Einsatzdatum', 'Beginn (Ist)', 'Ende (Ist)']);
    expect(mapping.name).toBe('Name des Mitarbeiters');
    expect(mapping.date).toBe('Einsatzdatum');
    expect(mapping.start).toBe('Beginn (Ist)');
  });

  it('meldet fehlende Pflichtspalten', () => {
    const { missingRequired, unmapped } = suggestMapping(['Irgendwas', 'Summe']);
    expect(missingRequired).toContain('name');
    expect(missingRequired).toContain('date');
    expect(unmapped).toContain('Summe');
  });

  it('vergibt jede Spalte nur einmal', () => {
    const { mapping } = suggestMapping(['Name', 'Nachname', 'Datum', 'Start', 'Ende']);
    const columns = Object.values(mapping);
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('normalisiert Kopfzeilen', () => {
    expect(normalizeHeader('Pausen-Zeit (Min.)')).toBe('pausenzeitmin');
  });
});

describe('readName', () => {
  it('setzt getrennte Namen zusammen', () => {
    const mapping = { firstName: 'Vorname', lastName: 'Nachname' } as const;
    expect(readName({ Vorname: 'Max', Nachname: 'Mustermann' }, mapping)).toBe('Max Mustermann');
  });
  it('bevorzugt die Sammelspalte', () => {
    expect(readName({ Mitarbeiter: 'Lena Bergmann' }, { name: 'Mitarbeiter' })).toBe('Lena Bergmann');
  });
});

describe('CSV', () => {
  it('erkennt das Trennzeichen', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  it('beachtet Anfuehrungszeichen', () => {
    expect(splitCsvLine('"Mustermann, Max";"17:00";"01:00"', ';')).toEqual(['Mustermann, Max', '17:00', '01:00']);
    expect(splitCsvLine('a;"sagt ""hallo""";c', ';')).toEqual(['a', 'sagt "hallo"', 'c']);
  });

  it('liest eine Datei mit BOM und Leerzeilen', () => {
    const csv = '﻿Mitarbeiter;Datum;Beginn;Ende\nMax Mustermann;15.10.2026;17:00;01:00\n\nLena Bergmann;15.10.2026;17:00;01:00\n';
    const sheet = parseCsv(csv);
    expect(sheet.headers).toEqual(['Mitarbeiter', 'Datum', 'Beginn', 'Ende']);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]!.Mitarbeiter).toBe('Max Mustermann');
    expect(sheet.skippedEmpty).toBe(2); // Leerzeile in der Mitte + Zeilenumbruch am Ende
  });

  it('benennt doppelte Spalten eindeutig', () => {
    const sheet = parseCsv('Zeit;Zeit\n1;2');
    expect(sheet.headers).toEqual(['Zeit', 'Zeit (2)']);
  });

  it('meldet eine leere Datei verständlich', () => {
    expect(() => parseCsv('   ')).toThrow(ImportError);
  });
});

describe('XLSX', () => {
  it('liest eine erzeugte Arbeitsmappe inklusive Kopfzeile', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stunden');
    ws.addRow([]);                          // Leerzeile vor der Kopfzeile
    ws.addRow(['Mitarbeiter', 'Datum', 'Beginn', 'Ende', 'Pause']);
    ws.addRow(['Max Mustermann', '15.10.2026', '17:00', '01:00', 30]);
    ws.addRow([]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const sheet = await parseXlsx(buffer);
    expect(sheet.headers).toEqual(['Mitarbeiter', 'Datum', 'Beginn', 'Ende', 'Pause']);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]!.Pause).toBe(30);
    expect(sheet.sheetName).toBe('Stunden');
  });

  it('weist .xls mit einer verständlichen Meldung ab (Spec 53)', async () => {
    await expect(parseSpreadsheet('stunden.xls', Buffer.from(''))).rejects.toMatchObject({
      userMessage: expect.stringContaining('.xlsx'),
    });
  });

  it('weist unbekannte Formate ab', async () => {
    await expect(parseSpreadsheet('bild.png', Buffer.from(''))).rejects.toBeInstanceOf(ImportError);
  });
});
