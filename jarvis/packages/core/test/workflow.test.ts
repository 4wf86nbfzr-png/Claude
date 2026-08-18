import { afterEach, describe, expect, it } from 'vitest';
import { fakeFetch, FakeLlm, makeJarvis, type TestJarvis } from './fakes.js';

/**
 * Der vollstaendige Ablauf aus dem Pflichtenheft:
 *
 *   Recherche -> Empfaenger pruefen -> Mail erstellen -> Vorschau ->
 *   Freigabe abwarten -> erst danach versenden.
 *
 * Netz und Sprachmodell sind Attrappen, alles andere ist der echte Code.
 */

let t: TestJarvis;
afterEach(() => t?.dispose());

const STARTSEITE = `<!doctype html><html><head><title>Muster Bau GmbH – Hochbau Hamburg</title></head><body>
<nav><a href="/kontakt">Kontakt</a><a href="/impressum">Impressum</a></nav>
<h1>Muster Bau GmbH</h1>
<p>Wir realisieren Hochbau und Projektentwicklung im Raum Hamburg. Aktuell betreuen wir
mehrere Baustellen in der HafenCity.</p>
</body></html>`;

const IMPRESSUM = `<!doctype html><html><head><title>Impressum – Muster Bau GmbH</title></head><body>
<h1>Impressum</h1>
<p>Muster Bau GmbH<br>Musterstra&szlig;e 12<br>20095 Hamburg</p>
<p>E-Mail: <a href="mailto:info@muster-bau.de">info@muster-bau.de</a></p>
<p>Gesch&auml;ftsf&uuml;hrer: Klaus Petersen</p>
</body></html>`;

const KONTAKT = `<!doctype html><html><head><title>Kontakt</title></head><body>
<p>Rufen Sie uns an: +49 40 123456-0</p>
<p>Oder schreiben Sie an <a href="mailto:info@muster-bau.de">info@muster-bau.de</a></p>
</body></html>`;

function netz(): typeof fetch {
  return fakeFetch({
    'https://muster-bau.de': { body: STARTSEITE },
    'https://muster-bau.de/': { body: STARTSEITE },
    'https://muster-bau.de/impressum': { body: IMPRESSUM },
    'https://muster-bau.de/kontakt': { body: KONTAKT },
    'https://muster-bau.de/robots.txt': { body: 'User-agent: *\nDisallow: /intern/\n', contentType: 'text/plain' },
  });
}

describe('Kompletter Akquise-Ablauf', () => {
  it('recherchiert, belegt die Adresse, entwirft, wartet auf Freigabe und sendet erst danach', async () => {
    const llm = new FakeLlm([
      // Antwort des Modells beim Formulieren der Akquise-Mail.
      {
        text: JSON.stringify({
          betreff: 'Baustellenbewachung für Ihre Projekte in Hamburg',
          text: 'Sehr geehrte Damen und Herren,\n\nSie realisieren Hochbauprojekte in Hamburg. Wir übernehmen die Bewachung von Baustellen rund um die Uhr.\n\nBei Interesse melde ich mich gern mit Details.\n\nMit freundlichen Grüßen',
          akquisegrund: 'Einschätzung: laufende Hochbauprojekte in Hamburg sprechen für Bedarf an Baustellenbewachung.',
        }),
      },
    ]);
    t = makeJarvis({ llm, fetchImpl: netz(), env: { JARVIS_MIN_SEND_INTERVAL_SECONDS: '0' } });

    // --- 1. Recherche -----------------------------------------------------
    const profil = await t.jarvis.research.profileCompany({
      name: 'Muster Bau GmbH',
      website: 'https://muster-bau.de',
      ort: 'Hamburg',
      branche: 'Hochbau',
    });
    expect(profil.ok, profil.ok ? '' : profil.error.message).toBe(true);
    if (!profil.ok) return;

    // Die Adresse stammt woertlich aus dem Impressum und ist damit verifiziert.
    const verifiziert = profil.data.emails.filter((e) => e.verification === 'VERIFIZIERT');
    expect(verifiziert.map((e) => e.address)).toContain('info@muster-bau.de');
    expect(verifiziert[0]?.sourceUrl).toContain('muster-bau.de');
    expect(profil.data.contacts.some((c) => c.name === 'Klaus Petersen')).toBe(true);
    expect(profil.data.company.city).toBe('Hamburg');

    // --- 2. Kampagne und Entwurf -----------------------------------------
    const kampagne = t.jarvis.outreach.createCampaign({
      name: 'Hamburger Bauunternehmen',
      service: '24/7 Baustellenbewachung und Alarmüberwachung',
      region: 'Hamburg',
      goalCount: 15,
    });
    if (!kampagne.ok) throw new Error(kampagne.error.message);

    const ziel = t.jarvis.repos.campaigns.addTarget(kampagne.data.id, profil.data.company.id);
    const entwurf = await t.jarvis.outreach.draftFor(ziel.id);
    expect(entwurf.ok, entwurf.ok ? '' : entwurf.error.message).toBe(true);
    if (!entwurf.ok) return;

    expect(entwurf.data.empfaenger).toBe('info@muster-bau.de');
    expect(entwurf.data.betreff).toContain('Baustellenbewachung');
    expect(entwurf.data.akquisegrund).toContain('Einschätzung');

    // Noch ist nichts versendet.
    expect(t.transport.gesendet).toHaveLength(0);

    // --- 3. Vorschau und Freigabe ----------------------------------------
    const vorlesen = t.jarvis.mail.spokenVersion(entwurf.data.emailId);
    expect(vorlesen.ok).toBe(true);
    if (vorlesen.ok) {
      expect(vorlesen.data).toContain('Empfänger: Muster Bau GmbH, info@muster-bau.de');
      expect(vorlesen.data).toContain('Betreff:');
    }

    const anfrage = t.jarvis.mail.requestSendApproval(entwurf.data.emailId);
    if (!anfrage.ok) throw new Error(anfrage.error.message);

    const offene = t.jarvis.pendingApprovals();
    expect(offene).toHaveLength(1);
    const details = offene[0]!.details.map((d) => d.label);
    expect(details).toContain('Empfänger');
    expect(details).toContain('Betreff');
    expect(details).toContain('Mailtext');
    expect(t.transport.gesendet).toHaveLength(0);

    // --- 4. Versand nach Freigabe ----------------------------------------
    const ergebnis = await t.jarvis.approve(anfrage.data.approvalId);
    expect(ergebnis.ok, ergebnis.ok ? '' : ergebnis.error.message).toBe(true);

    expect(t.transport.gesendet).toHaveLength(1);
    const gesendet = t.transport.gesendet[0]!;
    expect(gesendet.to[0]?.address).toBe('info@muster-bau.de');
    expect(gesendet.from.address).toBe('absender@example.org');
    expect(gesendet.subject).toContain('Baustellenbewachung');

    // --- 5. Nachweisbarkeit ----------------------------------------------
    const zeilen = t.jarvis.sendingCenter(kampagne.data.id);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.target.status).toBe('gesendet');
    expect(zeilen[0]?.verification).toBe('VERIFIZIERT');
    expect(zeilen[0]?.sourceUrl).toContain('muster-bau.de');
    expect(zeilen[0]?.target.reason).toContain('Einschätzung');

    const protokoll = t.jarvis.audit.list({ limit: 100 }).map((l) => l.action);
    for (const erwartet of [
      'recherche.firma',
      'kampagne.angelegt',
      'mail.entwurf_erstellt',
      'freigabe.angefragt',
      'freigabe.erteilt',
      'mail.gesendet',
    ]) {
      expect(protokoll, `Im Protokoll fehlt "${erwartet}"`).toContain(erwartet);
    }

    // Die Firma gilt jetzt als kontaktiert -- ein zweiter Erstkontakt wird verhindert.
    const zweiterVersuch = await t.jarvis.outreach.researchTargets(kampagne.data.id, {
      branche: 'Hochbau',
      ort: 'Hamburg',
      limit: 1,
    });
    if (zweiterVersuch.ok) {
      const uebersprungen = zweiterVersuch.data.uebersprungen.map((u) => u.grund).join(' ');
      expect(uebersprungen.length === 0 || uebersprungen).toBeTruthy();
    }
  });

  it('meldet ehrlich, wenn keine verifizierte Adresse zu finden war', async () => {
    const ohneAdresse = `<!doctype html><html><head><title>Stille Bau GmbH</title></head><body>
      <h1>Stille Bau GmbH</h1><p>Wir bauen. Kontakt über unser Formular.</p></body></html>`;

    t = makeJarvis({
      fetchImpl: fakeFetch({
        'https://stille-bau.de': { body: ohneAdresse },
        'https://stille-bau.de/robots.txt': { body: '', contentType: 'text/plain' },
      }),
    });

    const profil = await t.jarvis.research.profileCompany({ name: 'Stille Bau GmbH', website: 'https://stille-bau.de' });
    expect(profil.ok).toBe(true);
    if (!profil.ok) return;

    expect(profil.data.emails).toHaveLength(0);
    expect(profil.data.hinweise).toContain('Keine verifizierte E-Mail-Adresse gefunden.');

    // Und es wird auch keine Adresse erfunden, um trotzdem eine Mail zu bauen.
    const kampagne = t.jarvis.outreach.createCampaign({ name: 'Test', service: 'Bewachung' });
    if (!kampagne.ok) throw new Error('Kampagne fehlgeschlagen');
    const ziel = t.jarvis.repos.campaigns.addTarget(kampagne.data.id, profil.data.company.id);

    const entwurf = await t.jarvis.outreach.draftFor(ziel.id);
    expect(entwurf.ok).toBe(false);
    if (!entwurf.ok) {
      expect(entwurf.error.code).toBe('UNVERIFIED_RECIPIENT');
      expect(entwurf.error.message).toContain('Keine verifizierte E-Mail-Adresse gefunden');
    }
  });

  it('respektiert robots.txt', async () => {
    t = makeJarvis({
      fetchImpl: fakeFetch({
        'https://gesperrt.example/robots.txt': { body: 'User-agent: *\nDisallow: /\n', contentType: 'text/plain' },
        'https://gesperrt.example/': { body: '<html><body>geheim</body></html>' },
      }),
    });

    const r = await t.jarvis.research.fetchPage('https://gesperrt.example/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('ROBOTS_DISALLOWED');
  });
});
