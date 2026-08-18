import { describe, expect, it } from 'vitest';
import { bewerteAdresse, darfAngeschriebenWerden, pruefeMx } from '../src/core/research/verification';
import { VerificationStatus } from '../src/shared/status';

const basis = {
  address: 'info@beispiel-bau.de',
  evidenceUrl: 'https://beispiel-bau.de/impressum',
  companyDomain: 'beispiel-bau.de',
  fundart: 'mailto' as const,
  seitenart: 'impressum' as const,
  mxVorhanden: true
};

describe('Bewertung gefundener Adressen', () => {
  it('erklärt eine Adresse aus dem Impressum für verifiziert', () => {
    const ergebnis = bewerteAdresse(basis);
    expect(ergebnis.status).toBe(VerificationStatus.VERIFIZIERT);
    expect(darfAngeschriebenWerden(ergebnis.status)).toBe(true);
  });

  it('stuft eine nur geratene Adresse immer als nicht verifiziert ein', () => {
    const ergebnis = bewerteAdresse({
      ...basis,
      address: 'vorname.nachname@beispiel-bau.de',
      fundart: 'vermutung',
      evidenceUrl: null
    });
    expect(ergebnis.status).toBe(VerificationStatus.NICHT_VERIFIZIERT);
    expect(darfAngeschriebenWerden(ergebnis.status)).toBe(false);
    expect(ergebnis.begruendung).toMatch(/Namensschema/);
  });

  it('lässt auch mit Beleg keine Vermutung durchgehen', () => {
    const ergebnis = bewerteAdresse({ ...basis, fundart: 'vermutung' });
    expect(ergebnis.status).toBe(VerificationStatus.NICHT_VERIFIZIERT);
  });

  it('verlangt eine Quelle', () => {
    const ergebnis = bewerteAdresse({ ...basis, evidenceUrl: null });
    expect(ergebnis.status).toBe(VerificationStatus.NICHT_VERIFIZIERT);
    expect(ergebnis.begruendung).toMatch(/Quelle/);
  });

  it('lehnt ungültige Zeichenfolgen ab', () => {
    expect(bewerteAdresse({ ...basis, address: 'info(at)beispiel-bau.de' }).status).toBe(
      VerificationStatus.NICHT_VERIFIZIERT
    );
  });

  it('stuft herab, wenn die Domain keine Mails annimmt', () => {
    const ergebnis = bewerteAdresse({ ...basis, mxVorhanden: false });
    expect(ergebnis.status).toBe(VerificationStatus.NICHT_VERIFIZIERT);
    expect(ergebnis.begruendung).toMatch(/DNS/);
  });

  it('behandelt eine fremde Domain auf der Firmenseite nur als wahrscheinlich', () => {
    const ergebnis = bewerteAdresse({ ...basis, address: 'hallo@agentur-nord.de' });
    expect(ergebnis.status).toBe(VerificationStatus.WAHRSCHEINLICH);
    expect(darfAngeschriebenWerden(ergebnis.status)).toBe(false);
  });

  it('erkennt ein auf der Firmenseite genanntes Freemail-Postfach an', () => {
    const ergebnis = bewerteAdresse({ ...basis, address: 'beispiel.bau@gmx.de' });
    expect(ergebnis.status).toBe(VerificationStatus.VERIFIZIERT);
  });

  it('stuft Treffer aus Verzeichnissen als wahrscheinlich ein', () => {
    const ergebnis = bewerteAdresse({
      ...basis,
      evidenceUrl: 'https://www.gelbeseiten.de/eintrag/beispiel-bau',
      seitenart: 'verzeichnis',
      fundart: 'klartext'
    });
    expect(ergebnis.status).toBe(VerificationStatus.WAHRSCHEINLICH);
  });

  it('akzeptiert eine entschlüsselte Schreibweise aus dem Impressum', () => {
    const ergebnis = bewerteAdresse({ ...basis, fundart: 'entschluesselt' });
    expect(ergebnis.status).toBe(VerificationStatus.VERIFIZIERT);
  });
});

describe('MX-Prüfung', () => {
  const resolver = (mx: string[], a: string[]) => ({
    resolveMx: async (): Promise<{ exchange: string; priority: number }[]> => {
      if (mx.length === 0) throw new Error('ENOTFOUND');
      return mx.map((exchange, index) => ({ exchange, priority: index }));
    },
    resolve4: async (): Promise<string[]> => {
      if (a.length === 0) throw new Error('ENOTFOUND');
      return a;
    }
  });

  it('erkennt vorhandene MX-Einträge', async () => {
    const ergebnis = await pruefeMx('info@beispiel.de', resolver(['mx.beispiel.de'], []) as never);
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.hosts).toEqual(['mx.beispiel.de']);
  });

  it('lässt ersatzweise den A-Eintrag gelten', async () => {
    const ergebnis = await pruefeMx('beispiel.de', resolver([], ['1.2.3.4']) as never);
    expect(ergebnis.ok).toBe(true);
  });

  it('meldet, wenn die Domain gar nicht erreichbar ist', async () => {
    const ergebnis = await pruefeMx('gibtesnicht.invalid', resolver([], []) as never);
    expect(ergebnis.ok).toBe(false);
  });
});
