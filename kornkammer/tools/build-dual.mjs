#!/usr/bin/env node
/* ============================================================
   Erzeugt dual.html: zwei Displays, Hof oben, Shop unten.
   Shop-Karten kommen aus data/produkte.json, Rezensionen aus
   data/rezensionen.json. Aufruf im Ordner kornkammer/:
     node tools/build-dual.mjs
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(base, 'data/produkte.json'), 'utf8'));
const rez = JSON.parse(readFileSync(join(base, 'data/rezensionen.json'), 'utf8')).rezensionen;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.8L12 17.6 5.9 21l1.3-6.8-5-4.7 6.8-.8z"/></svg>';
const ar = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const cart = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.5"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/></svg>';

const img = (p) => { const frei = `assets/img/produkte/frei/${p.id}.webp`; return existsSync(join(base, frei)) ? frei : 'assets/img/' + p.bilder[0]; };
const products = data.produkte.map((p) => {
  const cat = data.kategorien.find((k) => k.id === p.kat);
  const v0 = p.varianten.find((v) => v.preis != null) || p.varianten[0];
  const add = v0.preis != null
    ? `<button type="button" class="dp__add" data-add data-id="${p.id}" data-name="${esc(p.name)}" data-variant="${esc(v0.label)}" data-price="${v0.preis}" data-max="${v0.max || 99}" data-img="assets/img/${p.bilder[0]}" data-url="shop/produkte/${p.id}.html">In den Korb</button>`
    : `<a class="dp__add" href="kontakt.html">Anfragen</a>`;
  return `          <article class="dp" data-kat="${p.kat}">
            <figure class="media" data-ph="${esc(p.ph[0])}"><img src="${img(p)}" alt="${esc(p.name)}" loading="lazy" width="600" height="750"></figure>
            <span class="dp__cat">${esc(cat.name)}</span>
            <h3><a href="shop/produkte/${p.id}.html">${esc(p.name)}</a></h3>
            <div class="dp__row"><span class="dp__price">${v0.preis != null ? eur(v0.preis) : 'auf Anfrage'} <small style="font-weight:400;color:var(--ink-m)">${esc(v0.einheit)}</small></span>${add}</div>
          </article>`;
}).join('\n');
const chips = ['<button type="button" data-kat="alle" aria-pressed="true">Alle</button>']
  .concat(data.kategorien.map((k) => `<button type="button" data-kat="${k.id}" aria-pressed="false">${esc(k.name)}</button>`)).join('');
const reviews = rez.slice(0, 3).map((r) => `          <div class="dreview"><span class="stars" aria-label="5 von 5 Sternen">${star.repeat(5)}</span><p>„${esc(r.text)}“</p><small>${esc(r.name)} · Google · ${esc(r.zeit)}</small></div>`).join('\n');
const strip = [1, 6, 13, 9, 14, 17, 4, 27].map((i) => `<figure class="media" data-ph=""><img src="assets/img/galerie/g${String(i).padStart(2, '0')}.jpg" alt="" loading="lazy" width="251" height="190"></figure>`).join('');

const html = `<!DOCTYPE html>
<html lang="de" class="kein-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Team Kornkammer · Hof und Shop</title>
<meta name="description" content="Team Kornkammer auf zwei Bildschirmen: oben der Bioland-Hof in Witten, unten das Sortiment mit Direktbestellung.">
<!-- TESTBETRIEB: vor dem Live-Gang entfernen -->
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="https://www.team-kornkammer.de/dual.html">
<link rel="icon" href="assets/logo/favicon.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/bricolage-grotesque-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/instrument-sans-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/fonts.css">
<link rel="stylesheet" href="assets/css/styles.css">
<script>document.documentElement.classList.remove('kein-js');</script>
</head>
<body class="dual" data-root="./" data-mode="dual">

<!-- Globale Leiste: Marke, Ansichts-Umschalter, Korb -->
<header class="dbar">
  <a class="dbar__brand" href="index.html">Team Kornkammer<small>Kornkammer Haus Holte · Witten</small></a>
  <nav class="dmode" aria-label="Ansicht wählen">
    <button type="button" data-mode-set="oben" aria-pressed="false">Der Hof</button>
    <button type="button" data-mode-set="dual" aria-pressed="true">Beide</button>
    <button type="button" data-mode-set="unten" aria-pressed="false">Shop</button>
  </nav>
  <div class="dbar__tools">
    <button type="button" class="iconbtn cartbtn" aria-label="Warenkorb öffnen">${cart}<span class="cartbtn__n" aria-live="polite">0</span></button>
  </div>
</header>

<main class="dstage">

  <!-- ============ Oberes Display: der Hof ============ -->
  <section class="disp disp--oben" aria-label="Der Hof">
    <div class="disp__scroll" data-no-smooth>
      <nav class="disp__nav" aria-label="Hof">
        <a href="#d-start">Start</a><a href="#d-hof">Über den Hof</a><a href="#d-arbeit">Unsere Arbeit</a><a href="#d-team">Das Team</a><a href="#d-kontakt">Kontakt</a>
        <a class="pillb" href="#" data-go="unten">Zum Shop</a>
      </nav>

      <div class="dsec" id="d-start">
        <div class="dhero">
          <div>
            <h1 class="dhero__title">Natur trifft Handwerk</h1>
            <p class="dhero__text">Bioland-Hof mitten im Ruhrgebiet, seit 1987. Wir säen, ernten und verarbeiten selbst: Mehle in Bäckerqualität, kaltgepresste Öle, Senf auf Granitsteinen vermahlen, Kartoffeln nach Sorten. Hundert Prozent hofeigene Saat, rückverfolgbar bis auf den Acker.</p>
            <a class="dbtn" href="#d-hof">Mehr</a>
          </div>
          <div class="dhero__media">
            <figure class="media" data-ph="Ein Jahr auf dem Hof" style="--ar:9/16;max-height:70svh"><video class="clip" data-autoplay muted playsinline loop preload="metadata" poster="assets/img/video/hof-hochkant.jpg"><source src="assets/video/hof-hochkant.webm" type="video/webm"><source src="assets/video/hof-hochkant.mp4" type="video/mp4"></video></figure>
          </div>
          <div class="dhero__foot">
            <p class="dhero__mission">Unser Anspruch: Lebensmittel aus eigener Hand, ohne chemisch-synthetische Düngung und ohne Pflanzenschutzmittel, mit Fruchtfolge statt Chemie.</p>
            <div class="dhero__stat"><b>Seit 1987</b><span>bewirtschaften Dirk Liedmann und Bernhard Pawliczek die Felder nach Bioland-Richtlinien. Flächen in Witten, Dortmund und Essen.</span><a href="#d-hof">Zur Geschichte</a></div>
          </div>
        </div>
      </div>

      <div class="dsec" id="d-hof">
        <div class="dhead"><p class="eyebrow">Über den Hof</p><h2>Ein ehemaliges Rittergut, ohne Chemie bewirtschaftet</h2></div>
        <div class="dgrid">
          <div class="dcard"><figure class="media" data-ph="Kartoffelfeld in Blüte"><img src="assets/img/galerie/g06.jpg" alt="" loading="lazy" width="251" height="190"></figure><b>Bioland seit 1987</b><p>Als Bioland-Betrieb erfüllt der Hof einen Standard, der deutlich über den gesetzlichen Vorgaben der EU-Bio-Verordnung liegt. Der ganze Hof, nicht einzelne Flächen.</p></div>
          <div class="dcard"><figure class="media" data-ph="Hacken auf dem Feld"><img src="assets/img/galerie/g10.jpg" alt="" loading="lazy" width="251" height="190"></figure><b>Mechanisch statt chemisch</b><p>Unkraut wird gehackt, nicht gespritzt. Eine sechsgliedrige Fruchtfolge mit Rotklee als Gründüngung hält den Boden fruchtbar.</p></div>
          <div class="dcard"><figure class="media" data-ph="Schild am Acker"><img src="assets/img/galerie/g09.jpg" alt="" loading="lazy" width="251" height="190"></figure><b>Rückverfolgbar bis auf den Acker</b><p>Kartoffeln 2025/2026 wachsen in Dortmund-Barop und Dortmund-Mengede. Getreide kommt von Flächen in Essen, Witten und Dortmund.</p></div>
        </div>
      </div>

      <div class="dsec" id="d-arbeit">
        <div class="dhead"><p class="eyebrow">Unsere Arbeit</p><h2>Vom Acker ins Regal</h2></div>
        <ol class="dsteps">
          <li><div><b>Der Boden</b><p>Rotklee bindet Stickstoff. Der erste Schnitt geht an eine Bio-Biogasanlage, die Nährstoffe kommen als Gärsubstrat zurück; der zweite Schnitt wird Saatgut.</p></div></li>
          <li><div><b>Die Saat</b><p>Anbau 2025/2026: Senf, Hafer, Rotklee, Winterweizen, Dinkel, Kartoffeln und Blaumohn.</p></div></li>
          <li><div><b>Die Verarbeitung</b><p>Getreide in Bäckerqualität vermahlen, Öle kalt gepresst (Leinöl unter 40 °C, ungefiltert), Senf auf Granitsteinen. Alles aus hofeigener Saat.</p></div></li>
          <li><div><b>Der Verkauf</b><p>Rund 98 Prozent des Brotweizens gehen an Bäckereien. Der Rest: freitags im Hofverkauf, im Onlineshop, im Naturkosthandel unter der Marke Ruhrtalgold.</p></div></li>
        </ol>
        <div class="dstrip" style="margin-top:var(--gap-m)">${strip}</div>
      </div>

      <div class="dsec" id="d-team">
        <div class="dhead"><p class="eyebrow">Das Team</p><h2>Fünf Leute, die wissen, woher es kommt</h2></div>
        <div class="dgrid">
          <div class="dcard"><b>Dirk Liedmann</b><p>Betriebsleiter seit 1987, persönlich haftender Gesellschafter. Erklärt bei Hofbesuchen die Fruchtfolge.</p></div>
          <div class="dcard"><b>Bernhard Pawliczek</b><p>Gründer der Kornkammer Haus Holte, Partner seit 1987. Namensgeber des Senfs „Der scharfe Bernie“.</p></div>
          <div class="dcard"><b>Stefan Pawliczek</b><p>Persönlich haftender Gesellschafter, im Handelsregister seit September 2010.</p></div>
          <div class="dcard"><b>Sebastian Krol</b><p>IT, Kommissionierung und die Ölproduktion.</p></div>
          <div class="dcard"><b>Max</b><p>Der Neue im Team, gelernter Landwirt, im Ackerbau.</p></div>
        </div>
        <div class="dgrid" style="margin-top:var(--gap-l)">
${reviews}
        </div>
      </div>

      <div class="dsec" id="d-kontakt">
        <div class="dhead"><p class="eyebrow">Hofverkauf &amp; Kontakt</p><h2>Freitags am Gederfeldweg</h2></div>
        <div class="dgrid">
          <div class="dcard"><b>Hofverkauf</b><p>Jeden Freitag 8 bis 17 Uhr. Fällt ein Feiertag auf den Freitag, am Donnerstag. Telefonische Absprachen möglich.</p></div>
          <div class="dcard"><b>Adresse</b><p>Kornkammer Haus Holte<br>Gederfeldweg 37, 58453 Witten</p></div>
          <div class="dcard"><b>Kontakt</b><p><a href="tel:+4923022827475">02302 282 7475</a><br><a href="mailto:Team-Kornkammer@gmx.de">Team-Kornkammer@gmx.de</a></p></div>
        </div>
        <p style="margin-top:var(--gap-l);font-size:.82rem"><a href="impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz</a> · <a href="index.html">Klassische Ansicht</a></p>
      </div>
    </div>
  </section>

  <!-- ============ Unteres Display: der Shop ============ -->
  <section class="disp disp--unten" aria-label="Shop">
    <div class="disp__scroll" data-no-smooth>
      <nav class="disp__nav" aria-label="Shop">
        <a href="#d-shop">Sortiment</a><a href="shop/warenkorb.html">Korb &amp; Bestellung</a><a href="kontakt.html">Abholung freitags</a>
        <a class="pillb" href="#" data-go="oben">Zum Hof</a>
      </nav>
      <div class="dsec" id="d-shop">
        <div class="dshop__head">
          <div class="dhead" style="margin:0"><p class="eyebrow">Ruhrtalgold</p><h2>Sortiment</h2><p style="max-width:52ch">Preise inkl. 7 % MwSt., Stand Oktober 2026. Aus dem Korb wird eine Bestellanfrage; wir bestätigen Verfügbarkeit, Abholung oder Versand per E-Mail.</p></div>
          <div class="dchips" role="group" aria-label="Kategorie">${chips}</div>
        </div>
        <div class="dprod">
${products}
        </div>
      </div>
    </div>
  </section>

</main>

<script src="assets/js/main.js" defer></script>
<script src="assets/js/shop.js" defer></script>
<script src="assets/js/dual.js" defer></script>
</body>
</html>
`;
writeFileSync(join(base, 'dual.html'), html);
console.log('dual.html geschrieben: ' + data.produkte.length + ' Produkte, ' + Math.min(3, rez.length) + ' Rezensionen.');
