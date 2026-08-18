import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kernel } from '../src/core/kernel';
import { ApprovalStatus, EmailStatus, OutreachStatus, VerificationStatus } from '../src/shared/status';
import { FakeLlm, FakeTransport, fakeFetch, testEnv } from './helpers/fakes';

/**
 * Der vollständige Ablauf aus §21 und §23:
 * recherchieren → Adresse verifizieren → Entwurf → Vorschau → Freigabe → Versand.
 * Alles läuft durch den echten Kern; ersetzt sind nur Netz, Sprachmodell und Versandweg.
 */
describe('Vollständiger Akquise-Ablauf', () => {
  let kernel: Kernel;
  let transport: FakeTransport;

  const kontext = () => ({
    repos: kernel.repos,
    config: kernel.config,
    credentials: kernel.credentials,
    audit: kernel.audit,
    approvals: kernel.approvals,
    bus: kernel.bus,
    llm: kernel.llm,
    mail: kernel.mail,
    research: kernel.research,
    system: kernel.system,
    sessionId: 'test'
  });

  const werkzeug = (name: string, eingabe: Record<string, unknown>) =>
    kernel.registry.run(name, eingabe, kontext());

  beforeEach(() => {
    vi.stubGlobal('fetch', fakeFetch());
    transport = new FakeTransport();
    kernel = Kernel.create({
      env: testEnv(mkdtempSync(join(tmpdir(), 'jarvis-test-'))),
      llm: new FakeLlm(),
      mailTransport: transport,
      mxPruefer: async () => true
    });
  });

  afterEach(() => {
    kernel.close();
    vi.unstubAllGlobals();
  });

  it('recherchiert Unternehmen und belegt jede Adresse mit ihrer Quelle', async () => {
    const ergebnis = await werkzeug('research_companies', {
      branche: 'Bauunternehmen Hochbau',
      region: 'Hamburg',
      anzahl: 5
    });
    expect(ergebnis.ok).toBe(true);
    const daten = ergebnis.data as { gefunden: number; unternehmen: Record<string, unknown>[] };
    expect(daten.gefunden).toBe(1); // Das Branchenverzeichnis wird ausgelassen.
    expect(daten.unternehmen[0]).toMatchObject({
      name: 'Beispiel Bau GmbH',
      email: 'info@beispiel-bau.de',
      status: VerificationStatus.VERIFIZIERT
    });
    expect(String(daten.unternehmen[0]?.quelle)).toContain('impressum');

    // Die Adresse der Webagentur steht auf derselben Seite, gehört aber zu einer
    // fremden Domain – sie darf nicht als verifiziert gelten.
    const firma = kernel.repos.companies.list()[0]!;
    const agentur = kernel.repos.addresses
      .forCompany(firma.id)
      .find((a) => a.address === 'hallo@agentur-nord.de');
    expect(agentur?.verificationStatus).toBe(VerificationStatus.WAHRSCHEINLICH);
  });

  it('bereitet Entwürfe vor, versendet aber nichts', async () => {
    const kampagne = await werkzeug('create_campaign', {
      name: 'Hamburger Bauunternehmen',
      dienstleistung: '24/7 Baustellenbewachung',
      region: 'Hamburg',
      zielanzahl: 10
    });
    const campaignId = (kampagne.data as { campaignId: number }).campaignId;

    const vorbereitung = await werkzeug('prepare_outreach', {
      campaignId,
      branche: 'Bauunternehmen Hochbau',
      anzahl: 3
    });
    expect(vorbereitung.ok).toBe(true);
    const bericht = vorbereitung.data as { recherchiert: number; entwuerfe: number };
    expect(bericht.recherchiert).toBe(1);
    expect(bericht.entwuerfe).toBe(1);
    expect(transport.gesendet).toHaveLength(0);

    const zeilen = kernel.repos.campaigns.outreachRows({ campaignId });
    expect(zeilen[0]).toMatchObject({
      company: 'Beispiel Bau GmbH',
      email: 'info@beispiel-bau.de',
      verification: VerificationStatus.VERIFIZIERT,
      status: OutreachStatus.ENTWURF_ERSTELLT
    });
    expect(zeilen[0]?.reason).toContain('Beispiel Bau');
  });

  it('versendet erst nach ausdrücklicher Freigabe – und protokolliert den ganzen Weg', async () => {
    await werkzeug('research_companies', { branche: 'Bauunternehmen', region: 'Hamburg', anzahl: 1 });
    const firma = kernel.repos.companies.list()[0]!;
    const entwurf = await werkzeug('compose_outreach_email', {
      companyId: firma.id,
      dienstleistung: '24/7 Baustellenbewachung'
    });
    const emailId = (entwurf.data as { emailId: number }).emailId;

    // Ohne Freigabe passiert nichts.
    const ohneFreigabe = await werkzeug('send_email', { emailId, approvalId: 999 });
    expect(ohneFreigabe.ok).toBe(false);
    expect(transport.gesendet).toHaveLength(0);

    const anfrage = await werkzeug('request_send_approval', { emailId });
    expect(anfrage.ok).toBe(true);
    const approvalId = (anfrage.data as { approvalId: number }).approvalId;
    expect(kernel.repos.emails.byId(emailId)?.status).toBe(EmailStatus.WARTET_AUF_FREIGABE);

    // Auch mit der richtigen Nummer, aber ohne Entscheidung: kein Versand.
    const vorEntscheidung = await werkzeug('send_email', { emailId, approvalId });
    expect(vorEntscheidung.ok).toBe(false);
    expect(vorEntscheidung.summary).toMatch(/Freigabe/);
    expect(transport.gesendet).toHaveLength(0);

    // Der Benutzer gibt frei – erst jetzt geht die Nachricht raus.
    const ergebnis = await kernel.core.genehmige(approvalId, true, 'Test');
    expect(ergebnis.ok).toBe(true);
    expect(transport.gesendet).toHaveLength(1);
    expect(transport.gesendet[0]?.to).toEqual(['info@beispiel-bau.de']);
    expect(transport.gesendet[0]?.subject).toContain('Beispiel Bau');
    expect(transport.gesendet[0]?.text).toContain('Maik Herm');
    expect(kernel.repos.emails.byId(emailId)?.status).toBe(EmailStatus.GESENDET);

    // Dieselbe Freigabe lässt sich kein zweites Mal einlösen.
    const zweiterVersuch = await werkzeug('send_email', { emailId, approvalId });
    expect(zweiterVersuch.ok).toBe(false);
    expect(transport.gesendet).toHaveLength(1);

    const protokoll = kernel.audit.recent(100).map((eintrag) => eintrag.action);
    expect(protokoll).toContain('Freigabe angefragt');
    expect(protokoll).toContain('Freigabe erteilt');
    expect(protokoll).toContain('E-Mail versendet');
  });

  it('verweigert den Versand, wenn der Text nach der Freigabe geändert wurde', async () => {
    await werkzeug('research_companies', { branche: 'Bauunternehmen', region: 'Hamburg', anzahl: 1 });
    const firma = kernel.repos.companies.list()[0]!;
    const entwurf = await werkzeug('compose_outreach_email', {
      companyId: firma.id,
      dienstleistung: 'Baustellenbewachung'
    });
    const emailId = (entwurf.data as { emailId: number }).emailId;
    const anfrage = await werkzeug('request_send_approval', { emailId });
    const approvalId = (anfrage.data as { approvalId: number }).approvalId;
    kernel.approvals.decide(approvalId, true);

    // Nachträgliche Änderung: die Freigabe passt nicht mehr zum Inhalt.
    kernel.repos.emails.updateDraft(emailId, { bodyText: 'Ganz anderer Text.' });

    const ergebnis = await werkzeug('send_email', { emailId, approvalId });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.summary).toMatch(/geändert|Freigabe/);
    expect(transport.gesendet).toHaveLength(0);
  });

  it('meldet einen Versandfehler als Fehler und nicht als Erfolg', async () => {
    const entwurf = kernel.repos.emails.createDraft({
      to: ['info@beispiel-bau.de'],
      subject: 'Test',
      bodyText: 'Text'
    });
    const anfrage = await werkzeug('request_send_approval', { emailId: entwurf.id });
    const approvalId = (anfrage.data as { approvalId: number }).approvalId;
    transport.fehlerBeimNaechsten = 'SMTP 550: Mailbox unavailable';

    const ergebnis = await kernel.core.genehmige(approvalId, true);
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toMatch(/fehlgeschlagen/i);
    expect(ergebnis.meldung).toContain('550');
    expect(kernel.repos.emails.byId(entwurf.id)?.status).toBe(EmailStatus.FEHLGESCHLAGEN);
  });

  it('schreibt niemanden an, der auf der Sperrliste steht', async () => {
    kernel.repos.suppression.add('info@beispiel-bau.de', 'adresse', 'Widerspruch');
    const ergebnis = await werkzeug('create_email_draft', {
      to: ['info@beispiel-bau.de'],
      subject: 'Angebot',
      bodyText: 'Text'
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.summary).toMatch(/Sperrliste/);
  });

  it('lehnt eine Rundmail an zu viele Empfänger ab', async () => {
    const entwurf = kernel.repos.emails.createDraft({
      to: ['a@beispiel-bau.de', 'b@beispiel-bau.de', 'c@beispiel-bau.de', 'd@beispiel-bau.de'],
      subject: 'Sammelmail',
      bodyText: 'Text'
    });
    const ergebnis = await werkzeug('request_send_approval', { emailId: entwurf.id });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.summary).toMatch(/Empfänger/);
  });

  it('nimmt eine gesprochene Freigabe entgegen, aber nur bei eindeutiger Formulierung', async () => {
    await werkzeug('research_companies', { branche: 'Bauunternehmen', region: 'Hamburg', anzahl: 1 });
    const firma = kernel.repos.companies.list()[0]!;
    const entwurf = await werkzeug('compose_outreach_email', {
      companyId: firma.id,
      dienstleistung: 'Baustellenbewachung'
    });
    const emailId = (entwurf.data as { emailId: number }).emailId;
    const anfrage = await werkzeug('request_send_approval', { emailId });
    const approvalId = (anfrage.data as { approvalId: number }).approvalId;

    // Unklare Äußerung: nichts passiert.
    await kernel.core.verarbeite('Vielleicht senden wir das später');
    expect(kernel.approvals.byId(approvalId)?.status).toBe(ApprovalStatus.OFFEN);
    expect(transport.gesendet).toHaveLength(0);

    // Eindeutige Freigabe: jetzt wird versendet.
    const antwort = await kernel.core.verarbeite('Ja, genau so senden');
    expect(transport.gesendet).toHaveLength(1);
    expect(antwort.nachricht.content).toMatch(/versendet/i);
  });

  it('versendet im Testbetrieb nichts, meldet das aber deutlich', async () => {
    kernel.close();
    kernel = Kernel.create({
      env: { ...testEnv(mkdtempSync(join(tmpdir(), 'jarvis-test-'))), JARVIS_DRY_RUN: 'true' },
      llm: new FakeLlm(),
      mailTransport: transport,
      mxPruefer: async () => true
    });
    const entwurf = kernel.repos.emails.createDraft({
      to: ['info@beispiel-bau.de'],
      subject: 'Test',
      bodyText: 'Text'
    });
    const anfrage = await werkzeug('request_send_approval', { emailId: entwurf.id });
    const approvalId = (anfrage.data as { approvalId: number }).approvalId;
    const ergebnis = await kernel.core.genehmige(approvalId, true);

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.meldung).toMatch(/Testbetrieb/);
    expect(transport.gesendet).toHaveLength(0);
    expect(kernel.repos.emails.byId(entwurf.id)?.status).toBe(EmailStatus.GESENDET);
  });
});
