import { describe, expect, it } from 'vitest';
import { extractPage, findEmailsInText } from '../src/core/research/PageExtractor.js';
import {
  isRoleAddress,
  isSyntacticallyValid,
  registrableDomain,
  verifyAddress,
} from '../src/core/research/EmailVerifier.js';
import { parseDuckDuckGo } from '../src/core/research/search.js';
import { RobotsRules } from '../src/core/research/HttpFetcher.js';
import { buildQueries, parseJsonObject, rankCandidates } from '../src/core/agents/CompanyResearchAgent.js';

const IMPRESSUM_HTML = `
<!doctype html><html><head><title>Impressum – Nordbau Hamburg GmbH</title>
<meta name="description" content="Hochbau und Projektentwicklung"></head>
<body>
  <nav><a href="/">Start</a><a href="/kontakt">Kontakt</a><a href="/impressum">Impressum</a></nav>
  <h1>Impressum</h1>
  <p>Nordbau Hamburg GmbH<br>Musterweg 3<br>20095 Hamburg</p>
  <p>Telefon: +49 40 123456-0</p>
  <p>E-Mail: <a href="mailto:info@nordbau-hamburg.example">info@nordbau-hamburg.example</a></p>
  <p>Bauleitung: bauleitung(at)nordbau-hamburg.example</p>
  <p>Geschäftsführer: Ute Petersen</p>
  <script>var tracking = "spam@tracker.example";</script>
</body></html>`;

describe('Seitenauswertung', () => {
  const page = extractPage(IMPRESSUM_HTML, 'https://nordbau-hamburg.example/impressum');

  it('liest Titel und Beschreibung', () => {
    expect(page.title).toContain('Nordbau Hamburg');
    expect(page.description).toContain('Hochbau');
  });

  it('findet die mailto-Adresse', () => {
    const found = page.emails.find((email) => email.address === 'info@nordbau-hamburg.example');
    expect(found).toBeDefined();
    expect(found?.origin).toBe('mailto');
  });

  it('entschlüsselt verschleierte Adressen im Text', () => {
    expect(page.emails.map((email) => email.address)).toContain('bauleitung@nordbau-hamburg.example');
  });

  it('ignoriert Adressen aus Skripten', () => {
    expect(page.emails.map((email) => email.address)).not.toContain('spam@tracker.example');
  });

  it('erkennt Impressum- und Kontaktlinks', () => {
    expect(page.imprintLinks.some((url) => url.endsWith('/impressum'))).toBe(true);
    expect(page.contactLinks.some((url) => url.endsWith('/kontakt'))).toBe(true);
  });

  it('findet Telefonnummern', () => {
    expect(page.phones.join(' ')).toContain('40 123456');
  });

  it('erfindet keine Adressen aus Namen', () => {
    // "Ute Petersen" steht auf der Seite, u.petersen@… nicht.
    expect(page.emails.map((email) => email.address)).not.toContain('u.petersen@nordbau-hamburg.example');
    expect(page.emails).toHaveLength(2);
  });
});

describe('Adressen im Fließtext', () => {
  it('erkennt die gängigen Verschleierungen', () => {
    const found = findEmailsInText(
      'Schreiben Sie an info [at] beispiel [punkt] de oder an kontakt(at)beispiel.de.',
    ).map((email) => email.address);
    expect(found).toContain('info@beispiel.de');
    expect(found).toContain('kontakt@beispiel.de');
  });

  it('schneidet nachlaufende Satzzeichen ab', () => {
    const found = findEmailsInText('Mail: info@beispiel.de.').map((email) => email.address);
    expect(found).toContain('info@beispiel.de');
  });

  it('hält Bilddateinamen heraus', () => {
    expect(findEmailsInText('logo@2x.png und sprite@3x.jpg')).toHaveLength(0);
  });
});

describe('Adressbewertung', () => {
  it('akzeptiert gültige und weist ungültige Syntax ab', () => {
    expect(isSyntacticallyValid('info@beispiel.de')).toBe(true);
    expect(isSyntacticallyValid('info@@beispiel.de')).toBe(false);
    expect(isSyntacticallyValid('info@beispiel')).toBe(false);
    expect(isSyntacticallyValid('info..test@beispiel.de')).toBe(false);
  });

  it('erkennt Rollenadressen', () => {
    expect(isRoleAddress('info@beispiel.de')).toBe(true);
    expect(isRoleAddress('ute.petersen@beispiel.de')).toBe(false);
  });

  it('bestimmt die registrierbare Domain', () => {
    expect(registrableDomain('https://www.nordbau-hamburg.de/impressum')).toBe('nordbau-hamburg.de');
    expect(registrableDomain('mail.firma.co.uk')).toBe('firma.co.uk');
  });

  it('stuft eine Impressumsadresse der eigenen Domain als verifiziert ein', async () => {
    const verdict = await verifyAddress(
      {
        address: 'info@nordbau-hamburg.example',
        sourceUrl: 'https://nordbau-hamburg.example/impressum',
        sourceKind: 'impressum',
        origin: 'mailto',
        companyDomain: 'nordbau-hamburg.example',
      },
      { checkMx: false },
    );
    expect(verdict.status).toBe('VERIFIZIERT');
    expect(verdict.reason).toContain('Impressum');
  });

  it('stuft eine fremde Domain herab', async () => {
    const verdict = await verifyAddress(
      {
        address: 'nordbau@gmail.com',
        sourceUrl: 'https://nordbau-hamburg.example/kontakt',
        sourceKind: 'kontakt',
        origin: 'text',
        companyDomain: 'nordbau-hamburg.example',
      },
      { checkMx: false },
    );
    expect(verdict.status).toBe('WAHRSCHEINLICH');
  });

  it('lehnt Systemadressen ab', async () => {
    const verdict = await verifyAddress(
      {
        address: 'no-reply@nordbau-hamburg.example',
        sourceUrl: 'https://nordbau-hamburg.example/impressum',
        sourceKind: 'impressum',
        origin: 'mailto',
        companyDomain: 'nordbau-hamburg.example',
      },
      { checkMx: false },
    );
    expect(verdict.status).toBe('NICHT_VERIFIZIERT');
  });

  it('stuft Treffer außerhalb offizieller Seiten nie auf verifiziert', async () => {
    const verdict = await verifyAddress(
      {
        address: 'info@nordbau-hamburg.example',
        sourceUrl: 'https://branchenbuch.example/eintrag/123',
        sourceKind: 'sonstige',
        origin: 'text',
        companyDomain: 'nordbau-hamburg.example',
      },
      { checkMx: false },
    );
    expect(verdict.status).toBe('WAHRSCHEINLICH');
  });
});

describe('Trefferaufbereitung', () => {
  it('gruppiert nach Domain und wirft Portale raus', () => {
    const candidates = rankCandidates([
      { title: 'Nordbau Hamburg', url: 'https://www.nordbau-hamburg.de/', snippet: '' },
      { title: 'Nordbau – Impressum', url: 'https://www.nordbau-hamburg.de/impressum', snippet: '' },
      { title: 'Nordbau bei Gelbe Seiten', url: 'https://www.gelbeseiten.de/x', snippet: '' },
      { title: 'Elbe Hochbau', url: 'https://elbe-hochbau.de/', snippet: '' },
      { title: 'LinkedIn', url: 'https://www.linkedin.com/company/x', snippet: '' },
    ]);
    expect(candidates.map((candidate) => candidate.domain)).toEqual([
      'nordbau-hamburg.de',
      'elbe-hochbau.de',
    ]);
    expect(candidates[0]?.score).toBe(2);
    expect(candidates[0]?.homepage).toBe('https://www.nordbau-hamburg.de/');
  });

  it('baut Suchanfragen inklusive Impressum und Kontakt', () => {
    expect(buildQueries({ query: 'Bauunternehmen', region: 'Hamburg', limit: 5 })).toEqual([
      'Bauunternehmen Hamburg',
      'Bauunternehmen Hamburg Impressum',
      'Bauunternehmen Hamburg Kontakt',
    ]);
  });

  it('liest JSON auch aus Codeblöcken', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('Hier: {"a":2} — fertig')).toEqual({ a: 2 });
    expect(parseJsonObject('kein json')).toBeNull();
  });

  it('liest DuckDuckGo-Trefferseiten', () => {
    const html = `
      <div><a class="result__a" href="/l/?uddg=https%3A%2F%2Fnordbau.example%2F">Nordbau <b>Hamburg</b></a>
      <a class="result__snippet">Hochbau in Hamburg</a></div>`;
    const hits = parseDuckDuckGo(html);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.url).toBe('https://nordbau.example/');
    expect(hits[0]?.title).toBe('Nordbau Hamburg');
    expect(hits[0]?.snippet).toBe('Hochbau in Hamburg');
  });
});

describe('robots.txt', () => {
  it('beachtet Disallow für alle', () => {
    const rules = RobotsRules.parse('User-agent: *\nDisallow: /intern', 'JarvisResearchBot/1.0');
    expect(rules.allows('/impressum')).toBe(true);
    expect(rules.allows('/intern/geheim')).toBe(false);
  });

  it('lässt Allow vor Disallow gewinnen, wenn es spezifischer ist', () => {
    const rules = RobotsRules.parse('User-agent: *\nDisallow: /\nAllow: /kontakt', 'JarvisResearchBot/1.0');
    expect(rules.allows('/kontakt')).toBe(true);
    expect(rules.allows('/andere')).toBe(false);
  });

  it('behandelt leeres Disallow als Erlaubnis', () => {
    const rules = RobotsRules.parse('User-agent: *\nDisallow:', 'JarvisResearchBot/1.0');
    expect(rules.allows('/beliebig')).toBe(true);
  });

  it('erlaubt alles, wenn keine robots.txt vorliegt', () => {
    expect(RobotsRules.permissive().allows('/irgendwas')).toBe(true);
  });
});
