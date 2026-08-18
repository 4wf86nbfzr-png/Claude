import { describe, expect, it } from 'vitest';
import {
  extractEmails,
  extractLegalLinks,
  extractObfuscatedEmails,
  extractPeople,
  extractPhones,
  extractPostalAddress,
} from '../src/research/extract.js';
import { classifyAddress, addressKind, isSyntacticallyValid } from '../src/research/verify.js';
import { isPathAllowed, parseRobots, extractTitle } from '../src/research/fetcher.js';
import { parseDuckDuckGoHtml } from '../src/research/search/providers.js';
import { cleanCompanyName, isPortalDomain } from '../src/research/service.js';
import { htmlToText } from '../src/util/text.js';
import { parseEmailJson } from '../src/outreach/service.js';

const IMPRESSUM = `<!doctype html><html><head><title>Impressum | Muster Bau GmbH</title></head><body>
<nav><a href="/kontakt">Kontakt</a><a href="/impressum">Impressum</a><a href="https://facebook.com/musterbau">Facebook</a></nav>
<h1>Impressum</h1>
<p>Muster Bau GmbH<br>Musterstra&szlig;e 12<br>20095 Hamburg</p>
<p>Telefon: +49 40 123456-0<br>
E-Mail: <a href="mailto:info@muster-bau.de">info@muster-bau.de</a></p>
<p>Gesch&auml;ftsf&uuml;hrer: Klaus Petersen</p>
<p>Bauleitung: schmidt@muster-bau.de</p>
<p>Bewerbungen bitte an bewerbung (at) muster-bau . de</p>
<img src="logo.png" alt="">
</body></html>`;

describe('Extraktion aus einer Impressumsseite', () => {
  const text = htmlToText(IMPRESSUM);

  it('findet Adressen aus mailto-Links und aus dem Text', () => {
    const gefunden = extractEmails(IMPRESSUM, text).map((e) => e.address);
    expect(gefunden).toContain('info@muster-bau.de');
    expect(gefunden).toContain('schmidt@muster-bau.de');
  });

  it('hält Bilddateien und Beispieladressen heraus', () => {
    const gefunden = extractEmails('<img src="a@b.png">', 'kontakt: noreply@example.com a@b.png');
    expect(gefunden.map((e) => e.address)).toHaveLength(0);
  });

  it('meldet verschleierte Adressen, löst sie aber nicht auf', () => {
    const verschleiert = extractObfuscatedEmails(text);
    expect(verschleiert).toHaveLength(1);
    expect(verschleiert[0]?.raw).toContain('(at)');
    // Sie taucht bewusst nicht bei den verwendbaren Adressen auf.
    expect(extractEmails(IMPRESSUM, text).map((e) => e.address)).not.toContain('bewerbung@muster-bau.de');
  });

  it('findet Telefonnummer und Anschrift', () => {
    expect(extractPhones(text)[0]?.number.replace(/\s/g, '')).toContain('+4940123456');
    const adr = extractPostalAddress(text);
    expect(adr.postalCode).toBe('20095');
    expect(adr.city).toBe('Hamburg');
    expect(adr.street).toContain('Musterstraße 12');
  });

  it('findet den Geschäftsführer mit Funktion', () => {
    const personen = extractPeople(text);
    expect(personen.some((p) => p.name === 'Klaus Petersen' && p.role.startsWith('Geschäftsführer'))).toBe(true);
  });

  it('nennt keine Person ohne belegte Funktion', () => {
    expect(extractPeople('Hier arbeitet Anna Schmidt gerne. Wir sind ein Team.')).toHaveLength(0);
  });

  it('findet Impressum und Kontakt, aber keine fremden Domains', () => {
    const links = extractLegalLinks(IMPRESSUM, 'https://muster-bau.de/impressum');
    const urls = links.map((l) => l.url);
    expect(urls).toContain('https://muster-bau.de/kontakt');
    expect(urls.some((u) => u.includes('facebook'))).toBe(false);
    expect(links[0]?.kind).toBe('impressum'); // Impressum zuerst
  });

  it('liest den Seitentitel', () => {
    expect(extractTitle(IMPRESSUM)).toBe('Impressum | Muster Bau GmbH');
  });
});

describe('Verifizierungsstatus', () => {
  it('ist VERIFIZIERT nur auf der eigenen Impressumsseite', () => {
    const r = classifyAddress({
      address: 'info@muster-bau.de',
      foundOnUrl: 'https://muster-bau.de/impressum',
      companyWebsite: 'https://www.muster-bau.de',
      sourceKind: 'impressum',
      mxOk: true,
    });
    expect(r.status).toBe('VERIFIZIERT');
    expect(r.note).toContain('Impressum');
  });

  it('ist nur WAHRSCHEINLICH auf einer fremden Seite', () => {
    const r = classifyAddress({
      address: 'info@muster-bau.de',
      foundOnUrl: 'https://branchenbuch.example/eintrag/muster-bau',
      companyWebsite: 'https://muster-bau.de',
      sourceKind: 'drittquelle',
      mxOk: true,
    });
    expect(r.status).toBe('WAHRSCHEINLICH');
  });

  it('ist NICHT_VERIFIZIERT ohne Fundstelle — hier landet jede Vermutung', () => {
    const r = classifyAddress({
      address: 'klaus.petersen@muster-bau.de',
      foundOnUrl: null,
      companyWebsite: 'https://muster-bau.de',
      sourceKind: 'website',
      mxOk: true,
    });
    expect(r.status).toBe('NICHT_VERIFIZIERT');
    expect(r.note).toContain('nicht auf einer abgerufenen Seite belegt');
  });

  it('stuft ab, wenn die Domain keine Mail annehmen kann', () => {
    const r = classifyAddress({
      address: 'info@muster-bau.de',
      foundOnUrl: 'https://muster-bau.de/impressum',
      companyWebsite: 'https://muster-bau.de',
      sourceKind: 'impressum',
      mxOk: false,
    });
    expect(r.status).toBe('WAHRSCHEINLICH');
  });

  it('prüft die Syntax streng genug', () => {
    expect(isSyntacticallyValid('info@muster-bau.de')).toBe(true);
    expect(isSyntacticallyValid('info@muster-bau')).toBe(false);
    expect(isSyntacticallyValid('info muster-bau.de')).toBe(false);
    expect(isSyntacticallyValid('a@b.c')).toBe(false);
  });

  it('unterscheidet Funktions- und Personenadressen', () => {
    expect(addressKind('info@firma.de')).toBe('funktion');
    expect(addressKind('vertrieb@firma.de')).toBe('funktion');
    expect(addressKind('klaus.petersen@firma.de')).toBe('person');
  });
});

describe('robots.txt', () => {
  const robots = `
User-agent: *
Disallow: /intern/
Disallow: /suche
Allow: /intern/oeffentlich/

User-agent: BoeserBot
Disallow: /
`;

  it('befolgt Disallow und die spezifischere Allow-Regel', () => {
    const rules = parseRobots(robots, 'JarvisResearchBot/1.0');
    expect(isPathAllowed(rules, '/impressum')).toBe(true);
    expect(isPathAllowed(rules, '/intern/geheim.html')).toBe(false);
    expect(isPathAllowed(rules, '/intern/oeffentlich/seite.html')).toBe(true);
    expect(isPathAllowed(rules, '/suche?q=test')).toBe(false);
  });

  it('erlaubt alles, wenn keine passende Gruppe existiert', () => {
    expect(isPathAllowed(parseRobots('', 'JarvisResearchBot/1.0'), '/beliebig')).toBe(true);
  });
});

describe('Suchtreffer-Auswertung', () => {
  it('liest Treffer aus der HTML-Fassung von DuckDuckGo', () => {
    const html = `
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmuster-bau.de%2F">Muster Bau GmbH</a>
        <a class="result__snippet">Hochbau und Projektentwicklung in Hamburg</a>
      </div>
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fzweite-firma.de%2F">Zweite Firma</a>
        <a class="result__snippet">Rohbau</a>
      </div>`;
    const hits = parseDuckDuckGoHtml(html, 10);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.url).toBe('https://muster-bau.de/');
    expect(hits[0]?.title).toBe('Muster Bau GmbH');
    expect(hits[0]?.snippet).toContain('Hochbau');
  });
});

describe('Aufbereitung von Firmennamen', () => {
  it('holt den Namen aus einem typischen Seitentitel', () => {
    expect(cleanCompanyName('Startseite | Muster Bau GmbH – Hochbau in Hamburg', 'muster-bau.de')).toBe('Muster Bau GmbH');
    expect(cleanCompanyName('Willkommen', 'zweite-firma.de')).toBe('zweite-firma.de');
  });

  it('erkennt Portale, die keine Unternehmenswebsites sind', () => {
    expect(isPortalDomain('gelbeseiten.de')).toBe(true);
    expect(isPortalDomain('linkedin.com')).toBe(true);
    expect(isPortalDomain('muster-bau.de')).toBe(false);
  });
});

describe('Antwort des Sprachmodells auswerten', () => {
  it('liest JSON auch aus einem Codeblock', () => {
    const r = parseEmailJson('Gern:\n```json\n{"betreff":"B","text":"T","akquisegrund":"G"}\n```\n');
    expect(r).toEqual({ betreff: 'B', text: 'T', akquisegrund: 'G' });
  });

  it('kommt mit Text drumherum zurecht', () => {
    const r = parseEmailJson('Hier ist der Entwurf: {"betreff":"B","text":"T"} — passt das?');
    expect(r?.betreff).toBe('B');
    expect(r?.akquisegrund).toContain('Keine Begründung');
  });

  it('liefert null bei unbrauchbarer Antwort', () => {
    expect(parseEmailJson('Ich kann das leider nicht.')).toBeNull();
  });
});
