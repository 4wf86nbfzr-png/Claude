/**
 * Dateiablage (Spec 30/71/72): Prüfung, Ablage ausserhalb des Web-Roots,
 * Rechte beim Abruf und Papierkorb.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { db, testBenutzer, TEST_USER } from './hilfen/db';
import { darfSehen, dokumentAnlegen, dokumentEntfernen, papierkorbLeeren } from '@/lib/domain/documents';
import { resolveStored } from '@/lib/storage';
import type { SessionUser } from '@/lib/auth/session';

const MARKE = `DOK-${Date.now()}`;
let employeeId = '';
const dokumentIds: string[] = [];

/** Kleinste gültige PDF-Datei – beginnt mit der Kennung %PDF. */
function pdf(inhalt = 'Testinhalt'): File {
  const bytes = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(inhalt), Buffer.from('\n%%EOF\n')]);
  return new File([bytes], 'nachweis.pdf', { type: 'application/pdf' });
}

beforeAll(async () => {
  await testBenutzer();
  const employee = await db.employee.create({ data: { personnelNo: MARKE, firstName: 'Doku', lastName: MARKE } });
  employeeId = employee.id;
});

afterAll(async () => {
  await db.document.deleteMany({ where: { employeeId } });
  await db.employee.deleteMany({ where: { id: employeeId } });
  await db.auditLog.deleteMany({ where: { userId: TEST_USER.id } });
  await db.$disconnect();
});

describe('Hochladen', () => {
  it('legt die Datei unter einer zufälligen ID ab und protokolliert', async () => {
    const dokument = await dokumentAnlegen(TEST_USER, {
      datei: pdf(), typ: 'FUEHRUNGSZEUGNIS', titel: 'Führungszeugnis',
      gueltigBis: '2031-12-31', employeeId,
    });
    dokumentIds.push(dokument.id);

    expect(dokument.fileName).toBe('nachweis.pdf');
    // Der Originalname taucht im Ablagepfad nicht auf.
    expect(dokument.filePath).not.toContain('nachweis');
    expect(dokument.filePath.startsWith(`mitarbeiter/${employeeId}/`)).toBe(true);
    expect(dokument.checksum).toHaveLength(64);

    const inhalt = await readFile(resolveStored(dokument.filePath));
    expect(inhalt.subarray(0, 4).toString()).toBe('%PDF');

    const protokoll = await db.auditLog.findFirst({ where: { entityId: dokument.id, action: 'document.create' } });
    expect(protokoll?.summary).toContain('Führungszeugnis');
  });

  it('weist eine Datei ab, deren Inhalt nicht zum Typ passt', async () => {
    const getarnt = new File([Buffer.from('MZ Dies ist keine PDF-Datei')], 'schadcode.pdf', { type: 'application/pdf' });
    await expect(dokumentAnlegen(TEST_USER, { datei: getarnt, typ: 'SONSTIGES', employeeId }))
      .rejects.toMatchObject({ userMessage: expect.stringContaining('passt nicht zum angegebenen Dateityp') });
  });

  it('weist unerlaubte Dateitypen ab', async () => {
    const programm = new File([Buffer.from('#!/bin/sh')], 'start.sh', { type: 'application/x-sh' });
    await expect(dokumentAnlegen(TEST_USER, { datei: programm, typ: 'SONSTIGES', employeeId }))
      .rejects.toMatchObject({ userMessage: expect.stringContaining('nicht erlaubt') });
  });

  it('verlangt genau eine Zuordnung', async () => {
    await expect(dokumentAnlegen(TEST_USER, { datei: pdf(), typ: 'SONSTIGES' }))
      .rejects.toMatchObject({ userMessage: expect.stringContaining('ordnen Sie das Dokument') });
  });

  it('verhindert Pfadausbrueche', () => {
    expect(() => resolveStored('../../etc/passwd')).toThrow();
  });
});

describe('Sichtbarkeit', () => {
  function benutzer(scope: SessionUser['scope'], extra: Partial<SessionUser> = {}): SessionUser {
    return {
      id: 'x', email: 'x@example.org', name: 'X', role: 'MITARBEITER',
      employeeId: null, partnerId: null, customerId: null, theme: 'light',
      scope, sessionId: 's', ...extra,
    };
  }

  it('Mitarbeiter sehen eigene Dokumente nur nach Freigabe', async () => {
    const gesperrt = await dokumentAnlegen(TEST_USER, { datei: pdf(), typ: 'VERTRAG', employeeId });
    const frei = await dokumentAnlegen(TEST_USER, { datei: pdf(), typ: 'SCHULUNGSNACHWEIS', employeeId, fuerMitarbeiterSichtbar: true });
    dokumentIds.push(gesperrt.id, frei.id);

    const eigner = benutzer('EIGENE', { employeeId });
    expect(await darfSehen(eigner, gesperrt.id)).toBe(false);
    expect(await darfSehen(eigner, frei.id)).toBe(true);

    // Ein anderer Mitarbeiter sieht nichts davon.
    expect(await darfSehen(benutzer('EIGENE', { employeeId: 'fremd' }), frei.id)).toBe(false);
    // Die Disposition sieht alles.
    expect(await darfSehen(benutzer('ALLE'), gesperrt.id)).toBe(true);
  });
});

describe('Papierkorb', () => {
  it('entfernt erst nach Ablauf der Frist endgültig', async () => {
    const dokument = await dokumentAnlegen(TEST_USER, { datei: pdf('wegwerf'), typ: 'SONSTIGES', employeeId });
    await dokumentEntfernen(TEST_USER, dokument.id);

    const weich = await db.document.findUnique({ where: { id: dokument.id } });
    expect(weich?.deletedAt).not.toBeNull();   // Datei ist noch da

    // Mit 30 Tagen Frist passiert nichts …
    await papierkorbLeeren(30);
    expect(await db.document.findUnique({ where: { id: dokument.id } })).not.toBeNull();

    // … mit Frist 0 wird endgültig aufgeräumt.
    await papierkorbLeeren(0);
    expect(await db.document.findUnique({ where: { id: dokument.id } })).toBeNull();
    await expect(readFile(resolveStored(dokument.filePath))).rejects.toThrow();
  });
});
