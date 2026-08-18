import { describe, expect, it } from 'vitest';
import { Db } from '../src/core/db/database';
import { createRepositories } from '../src/core/db/repositories';
import { OutreachStatus, VerificationStatus } from '../src/shared/status';
import { normalizeCompanyName, normalizeDomain, isRoleAddress, isValidEmailSyntax } from '../src/core/util/text';

const repos = () => createRepositories(Db.open(':memory:'));

describe('Textnormalisierung', () => {
  it('blendet Rechtsformen und Umlaute für den Vergleich aus', () => {
    expect(normalizeCompanyName('Müller Bau GmbH & Co. KG')).toBe(normalizeCompanyName('Mueller Bau GmbH'));
    expect(normalizeCompanyName('Hanse Hochbau AG')).toBe('hanse hochbau');
  });

  it('erkennt Domains unabhängig von Schema und www', () => {
    expect(normalizeDomain('https://www.Beispiel-Bau.de/kontakt')).toBe('beispiel-bau.de');
    expect(normalizeDomain('beispiel-bau.de')).toBe('beispiel-bau.de');
    expect(normalizeDomain('   ')).toBeNull();
  });

  it('unterscheidet Sammelpostfächer von persönlichen Adressen', () => {
    expect(isRoleAddress('info@beispiel.de')).toBe(true);
    expect(isRoleAddress('m.herm@beispiel.de')).toBe(false);
    expect(isValidEmailSyntax('kontakt@beispiel.de')).toBe(true);
    expect(isValidEmailSyntax('kontakt(at)beispiel.de')).toBe(false);
  });
});

describe('Unternehmensablage', () => {
  it('führt Dubletten über die Domain zusammen und ergänzt Lücken', () => {
    const r = repos();
    const erst = r.companies.upsert({ name: 'Beispiel Bau GmbH', website: 'https://www.beispiel-bau.de' });
    const zweit = r.companies.upsert({
      name: 'Beispiel Bau',
      website: 'http://beispiel-bau.de/impressum',
      city: 'Hamburg'
    });
    expect(erst.created).toBe(true);
    expect(zweit.created).toBe(false);
    expect(zweit.company.id).toBe(erst.company.id);
    expect(zweit.company.city).toBe('Hamburg');
    expect(r.companies.count()).toBe(1);
  });

  it('erkennt Dubletten auch ohne Website über Name und Ort', () => {
    const r = repos();
    r.companies.upsert({ name: 'Nordbau GmbH', city: 'Hamburg' });
    const zweit = r.companies.upsert({ name: 'Nordbau', city: 'Hamburg' });
    expect(zweit.created).toBe(false);
    expect(r.companies.count()).toBe(1);
  });
});

describe('E-Mail-Adressen', () => {
  it('stuft eine verifizierte Adresse nicht wieder herab', () => {
    const r = repos();
    const { company } = r.companies.upsert({ name: 'Testfirma', website: 'test-firma.de' });
    r.addresses.upsert({
      companyId: company.id,
      address: 'Info@Test-Firma.de',
      verificationStatus: VerificationStatus.VERIFIZIERT,
      verificationMethod: 'impressum',
      evidenceUrl: 'https://test-firma.de/impressum'
    });
    r.addresses.upsert({
      companyId: company.id,
      address: 'info@test-firma.de',
      verificationStatus: VerificationStatus.NICHT_VERIFIZIERT,
      verificationMethod: 'vermutung'
    });
    const alle = r.addresses.forCompany(company.id);
    expect(alle).toHaveLength(1);
    expect(alle[0]?.verificationStatus).toBe(VerificationStatus.VERIFIZIERT);
    expect(alle[0]?.address).toBe('info@test-firma.de');
  });

  it('liefert nur Adressen ab dem geforderten Verifizierungsgrad', () => {
    const r = repos();
    const { company } = r.companies.upsert({ name: 'Nur Vermutung' });
    r.addresses.upsert({
      companyId: company.id,
      address: 'kontakt@vermutung.de',
      verificationStatus: VerificationStatus.WAHRSCHEINLICH,
      verificationMethod: 'verzeichnis'
    });
    expect(r.addresses.best(company.id, VerificationStatus.VERIFIZIERT)).toBeNull();
    expect(r.addresses.best(company.id, VerificationStatus.WAHRSCHEINLICH)?.address).toBe('kontakt@vermutung.de');
  });
});

describe('Entwürfe', () => {
  it('ändert die Prüfsumme und löst die Freigabe, sobald der Text bearbeitet wird', () => {
    const r = repos();
    const draft = r.emails.createDraft({ to: ['kontakt@firma.de'], subject: 'Hallo', bodyText: 'Erster Text' });
    const approval = r.approvals.create({
      action: 'send_email',
      title: 'Versand',
      summary: 'Test',
      payload: { emailId: draft.id },
      contentHash: draft.contentHash
    });
    r.emails.linkApproval(draft.id, approval.id);
    expect(r.emails.byId(draft.id)?.approvalId).toBe(approval.id);

    const geaendert = r.emails.updateDraft(draft.id, { bodyText: 'Zweiter Text' })!;
    expect(geaendert.contentHash).not.toBe(draft.contentHash);
    expect(geaendert.approvalId).toBeNull();
  });
});

describe('Sperrliste', () => {
  it('sperrt einzelne Adressen und ganze Domains', () => {
    const r = repos();
    r.suppression.add('nein@firma.de', 'adresse', 'Widerspruch per Mail');
    r.suppression.add('gesperrt.de', 'domain');
    expect(r.suppression.blocks('NEIN@firma.de')?.reason).toBe('Widerspruch per Mail');
    expect(r.suppression.blocks('irgendwer@gesperrt.de')).not.toBeNull();
    expect(r.suppression.blocks('offen@firma.de')).toBeNull();
  });
});

describe('Versandzentrale', () => {
  it('führt Unternehmen, Adresse, Quelle und Status in einer Zeile zusammen', () => {
    const r = repos();
    const kampagne = r.campaigns.create({ name: 'Hamburger Bauunternehmen', service: 'Baustellenbewachung' });
    const { company } = r.companies.upsert({ name: 'Hanse Bau GmbH', website: 'hanse-bau.de', city: 'Hamburg' });
    r.addresses.upsert({
      companyId: company.id,
      address: 'info@hanse-bau.de',
      verificationStatus: VerificationStatus.VERIFIZIERT,
      verificationMethod: 'impressum',
      evidenceUrl: 'https://hanse-bau.de/impressum'
    });
    r.campaigns.addTarget(kampagne.id, company.id, 'Betreibt laufend Baustellen im Hamburger Hafen.');
    const draft = r.emails.createDraft({
      campaignId: kampagne.id,
      companyId: company.id,
      to: ['info@hanse-bau.de'],
      subject: 'Baustellenbewachung',
      bodyText: 'Moin …'
    });
    r.campaigns.setTargetStatus(kampagne.id, company.id, OutreachStatus.ENTWURF_ERSTELLT, { emailId: draft.id });

    const zeilen = r.campaigns.outreachRows({ campaignId: kampagne.id });
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({
      company: 'Hanse Bau GmbH',
      email: 'info@hanse-bau.de',
      verification: VerificationStatus.VERIFIZIERT,
      sourceUrl: 'https://hanse-bau.de/impressum',
      status: OutreachStatus.ENTWURF_ERSTELLT,
      emailId: draft.id
    });
    expect(zeilen[0]?.lastContactAt).toBeNull();
  });
});
