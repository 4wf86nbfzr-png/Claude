import 'server-only';
import ExcelJS from 'exceljs';

/**
 * Excel-Export (Spec 25).
 *
 * Eine Hilfsfunktion fuer alle Listen: Kopfzeile fett, Spaltenbreite nach
 * Inhalt, Zahlen als Zahlen (damit Excel damit rechnen kann) und ein
 * Autofilter, weil die Dateien in der Praxis weiterverarbeitet werden.
 */
export interface Spalte<T> {
  titel: string;
  wert: (zeile: T) => string | number | Date | null;
  breite?: number;
  format?: string;
}

export async function alsExcel<T>(
  blattName: string,
  spalten: Array<Spalte<T>>,
  zeilen: readonly T[],
  kopfzeile?: string[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HST Planer';
  wb.created = new Date();
  const ws = wb.addWorksheet(blattName.slice(0, 31));

  let versatz = 0;
  if (kopfzeile?.length) {
    for (const zeile of kopfzeile) {
      const reihe = ws.addRow([zeile]);
      reihe.font = { bold: versatz === 0, size: versatz === 0 ? 12 : 10 };
      versatz++;
    }
    ws.addRow([]);
    versatz++;
  }

  const kopf = ws.addRow(spalten.map((s) => s.titel));
  kopf.font = { bold: true };
  kopf.eachCell((zelle) => {
    zelle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFF3' } };
    zelle.border = { bottom: { style: 'thin', color: { argb: 'FFBBBBC4' } } };
  });

  for (const zeile of zeilen) {
    const werte = spalten.map((spalte) => spalte.wert(zeile));
    const reihe = ws.addRow(werte);
    spalten.forEach((spalte, index) => {
      if (spalte.format) reihe.getCell(index + 1).numFmt = spalte.format;
    });
  }

  spalten.forEach((spalte, index) => {
    ws.getColumn(index + 1).width = spalte.breite ?? Math.min(40, Math.max(12, spalte.titel.length + 4));
  });

  if (zeilen.length > 0) {
    ws.autoFilter = {
      from: { row: versatz + 1, column: 1 },
      to: { row: versatz + 1 + zeilen.length, column: spalten.length },
    };
  }
  ws.views = [{ state: 'frozen', ySplit: versatz + 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function dateiname(basis: string): string {
  return `${basis}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export const EXCEL_TYP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** CSV-Fassung derselben Spalten – fuer Systeme, die kein XLSX lesen. */
export function alsCsv<T>(spalten: Array<Spalte<T>>, zeilen: readonly T[]): string {
  const feld = (wert: string | number | Date | null): string => {
    if (wert == null) return '';
    const text = wert instanceof Date ? wert.toISOString().slice(0, 10) : String(wert);
    return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const kopf = spalten.map((s) => feld(s.titel)).join(';');
  const inhalt = zeilen.map((zeile) => spalten.map((s) => feld(s.wert(zeile))).join(';'));
  // BOM, damit Excel die Umlaute richtig liest.
  return `﻿${[kopf, ...inhalt].join('\r\n')}\r\n`;
}
