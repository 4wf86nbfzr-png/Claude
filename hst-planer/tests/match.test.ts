import { describe, expect, it } from 'vitest';
import { editDistance, matchName, nameSimilarity, nameTokens, normalizeName } from '@/lib/match';

const employees = [
  { id: 'e1', firstName: 'Max', lastName: 'Mustermann', personnelNo: 'HST-001' },
  { id: 'e2', firstName: 'Lena', lastName: 'Bergmann', personnelNo: 'HST-002' },
  { id: 'e3', firstName: 'Ayse', lastName: 'Yilmaz', personnelNo: 'HST-003' },
  { id: 'e4', firstName: 'Jan', lastName: 'Möller', personnelNo: 'HST-004' },
];
const nameOf = (e: (typeof employees)[number]) => [`${e.firstName} ${e.lastName}`, `${e.lastName} ${e.firstName}`, e.personnelNo];

describe('Normalisierung', () => {
  it('loest Umlaute und Sonderzeichen auf', () => {
    expect(normalizeName('Jan Möller')).toBe('jan moeller');
    expect(normalizeName('  MUSTERMANN,  Max ')).toBe('mustermann max');
    expect(nameTokens('Mustermann, Max')).toEqual(['max', 'mustermann']);
  });
});

describe('editDistance', () => {
  it('zaehlt Vertauschungen als einen Fehler', () => {
    expect(editDistance('mustermann', 'mustremann')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('nameSimilarity', () => {
  it('ignoriert die Reihenfolge', () => {
    expect(nameSimilarity('Max Mustermann', 'Mustermann Max')).toBe(1);
  });
  it('ignoriert Gross-/Kleinschreibung und Leerzeichen', () => {
    expect(nameSimilarity('MAX   MUSTERMANN', 'Max Mustermann')).toBe(1);
  });
  it('unterscheidet verschiedene Personen', () => {
    expect(nameSimilarity('Max Mustermann', 'Lena Bergmann')).toBeLessThan(0.5);
  });
});

describe('matchName (Spec 22)', () => {
  it('findet den exakten Namen', () => {
    expect(matchName('Max Mustermann', employees, nameOf).match?.id).toBe('e1');
  });

  it('findet gedrehte Namen', () => {
    expect(matchName('Mustermann Max', employees, nameOf).match?.id).toBe('e1');
    expect(matchName('Mustermann, Max', employees, nameOf).match?.id).toBe('e1');
  });

  it('vertraegt Tippfehler', () => {
    expect(matchName('Max Mustremann', employees, nameOf).match?.id).toBe('e1');
  });

  it('findet ueber die Personalnummer', () => {
    expect(matchName('HST-003', employees, nameOf).match?.id).toBe('e3');
  });

  it('findet Umlaut-Schreibweisen', () => {
    expect(matchName('Jan Moeller', employees, nameOf).match?.id).toBe('e4');
  });

  it('ordnet Unbekannte nicht zu', () => {
    const result = matchName('Petra Schneider', employees, nameOf);
    expect(result.match).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });

  it('ordnet bei aehnlichen Namen nicht automatisch zu, sondern schlaegt vor', () => {
    const aehnliche = [
      { id: 'a', firstName: 'Jan', lastName: 'Meier', personnelNo: 'P1' },
      { id: 'b', firstName: 'Jan', lastName: 'Maier', personnelNo: 'P2' },
    ];
    const result = matchName('Jan Mayer', aehnliche, (e) => `${e.firstName} ${e.lastName}`);
    expect(result.match).toBeNull();
    expect(result.candidates.length).toBe(2);
  });

  it('erkennt echte Namensgleichheit als mehrdeutig', () => {
    const namensvettern = [
      { id: 'a', firstName: 'Jan', lastName: 'Meier', personnelNo: 'P1' },
      { id: 'b', firstName: 'Jan', lastName: 'Meier', personnelNo: 'P2' },
    ];
    const result = matchName('Jan Meier', namensvettern, (e) => `${e.firstName} ${e.lastName}`);
    expect(result.match).toBeNull();
    expect(result.ambiguous).toBe(true);
    expect(result.candidates.map((c) => c.item.id).sort()).toEqual(['a', 'b']);
  });

  it('liefert bei leerer Eingabe nichts', () => {
    expect(matchName('   ', employees, nameOf).match).toBeNull();
  });
});
