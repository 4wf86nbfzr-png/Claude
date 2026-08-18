import { describe, expect, it } from 'vitest';
import { extractKontakte, extractPageInfo, findeKontaktseiten, htmlToText, seitenArt } from '../src/core/research/extractor';
import { firmennameAusImpressum } from '../src/core/research';
import { erlaubt, parseRobots } from '../src/core/research/http';

const IMPRESSUM = `<!doctype html><html><head><title>Impressum – Nordbau GmbH</title></head><body>
  <h1>Impressum</h1>
  <p>Nordbau GmbH &amp; Co. KG<br>Hafenstraße 12<br>20095 Hamburg</p>
  <p>Geschäftsführer: Klaus Meier</p>
  <p>Bauleiterin: Sabine Wolters</p>
  <p>Telefon: 040 1234560<br>
     E-Mail: <a href="mailto:Info@Nordbau.de">Info@Nordbau.de</a></p>
  <p>Datenschutz: datenschutz(at)nordbau(punkt)de</p>
  <nav><a href="/kontakt">Kontakt</a><a href="https://fremde-seite.de/impressum">Fremd</a></nav>
</body></html>`;

describe('Seitenauswertung', () => {
  const info = extractPageInfo(IMPRESSUM, 'https://nordbau.de/impressum');

  it('liest Adressen aus mailto-Verweisen und normalisiert sie', () => {
    const treffer = info.emails.find((e) => e.address === 'info@nordbau.de');
    expect(treffer).toBeDefined();
    expect(treffer?.method).toBe('mailto');
  });

  it('erkennt auch verschleierte Schreibweisen', () => {
    const treffer = info.emails.find((e) => e.address === 'datenschutz@nordbau.de');
    expect(treffer?.method).toBe('entschluesselt');
  });

  it('findet Telefonnummer, Postleitzahl und Ort', () => {
    expect(info.phones.some((n) => n.replace(/\D/g, '').startsWith('0401234560'))).toBe(true);
    expect(info.postleitzahl).toBe('20095');
    expect(info.ort).toBe('Hamburg');
  });

  it('erkennt Ansprechpartner mit Funktion', () => {
    const namen = info.kontakte.map((k) => k.name);
    expect(namen).toContain('Klaus Meier');
    expect(namen).toContain('Sabine Wolters');
  });

  it('nimmt für Kontaktseiten nur Links derselben Domain', () => {
    const seiten = findeKontaktseiten(info.links, 'https://nordbau.de/impressum');
    expect(seiten).toContain('https://nordbau.de/kontakt');
    expect(seiten.some((url) => url.includes('fremde-seite.de'))).toBe(false);
  });

  it('bestimmt die Seitenart aus der Adresse', () => {
    expect(seitenArt('https://nordbau.de/impressum')).toBe('impressum');
    expect(seitenArt('https://nordbau.de/kontakt')).toBe('kontakt');
    expect(seitenArt('https://nordbau.de/leistungen')).toBe('website');
  });

  it('macht aus HTML lesbaren Text ohne Skripte', () => {
    const text = htmlToText('<body><script>alert(1)</script><p>Hallo</p><p>Welt</p></body>');
    expect(text).toContain('Hallo');
    expect(text).not.toContain('alert');
  });
});

describe('Firmenname aus dem Impressum', () => {
  it('nimmt die Zeile mit der Rechtsform, nicht die Überschrift', () => {
    expect(firmennameAusImpressum('Impressum\nNordbau GmbH & Co. KG\nHafenstraße 12')).toBe(
      'Nordbau GmbH & Co. KG'
    );
  });

  it('überspringt Formelzeilen', () => {
    expect(firmennameAusImpressum('Angaben gemäß § 5 TMG\nHanse Sicherheit UG\nHamburg')).toBe(
      'Hanse Sicherheit UG'
    );
  });

  it('gibt nichts zurück, wenn keine Firmierung erkennbar ist', () => {
    expect(firmennameAusImpressum('Kontakt\nBitte rufen Sie uns an.')).toBeNull();
  });
});

describe('Ansprechpartner-Erkennung', () => {
  it('erkennt beide Schreibweisen', () => {
    expect(extractKontakte('Geschäftsführer: Dr. Klaus Meier').map((k) => k.name)).toContain('Klaus Meier');
    expect(extractKontakte('Sabine Wolters, Projektleiterin').map((k) => k.name)).toContain('Sabine Wolters');
  });

  it('erfindet keine Namen, wo keine stehen', () => {
    expect(extractKontakte('Unsere Geschäftsführung erreichen Sie telefonisch.')).toHaveLength(0);
  });
});

describe('robots.txt', () => {
  const regeln = parseRobots('User-agent: *\nDisallow: /intern/\nAllow: /intern/oeffentlich/\nCrawl-delay: 2');

  it('sperrt verbotene Pfade', () => {
    expect(erlaubt(regeln, '/impressum')).toBe(true);
    expect(erlaubt(regeln, '/intern/geheim')).toBe(false);
  });

  it('lässt die genauere Allow-Regel gewinnen', () => {
    expect(erlaubt(regeln, '/intern/oeffentlich/seite')).toBe(true);
  });

  it('beachtet nur den Block für alle Robots', () => {
    const nurGoogle = parseRobots('User-agent: Googlebot\nDisallow: /');
    expect(erlaubt(nurGoogle, '/beliebig')).toBe(true);
  });
});
