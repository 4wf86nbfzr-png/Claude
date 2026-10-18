#!/usr/bin/env node
/* ============================================================
   Erzeugt aus data/produkte.json:
     shop/index.html               Sortiment (alle Kategorien)
     shop/produkte/<id>.html       eine Seite je Produkt
   Aufruf im Ordner kornkammer/:  node tools/build-produkte.mjs
   Kopfzeile, Menü und Fußzeile stehen hier einmal und müssen mit den
   handgeschriebenen Seiten übereinstimmen (siehe README.md).
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, '..');
const data = JSON.parse(readFileSync(join(base, 'data/produkte.json'), 'utf8'));
const SITE = 'https://www.team-kornkammer.de';   // für canonical/og; vor Live-Gang prüfen

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const eur = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const ico = {
  arrow: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  plus: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  cart: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.5"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/></svg>',
  check: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  info: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>'
};

/* ---------- Gemeinsamer Rahmen ---------- */
function head({ root, title, desc, canonical, extraCss = '' }) {
  return `<!DOCTYPE html>
<html lang="de" class="kein-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<!-- TESTBETRIEB: vor dem Live-Gang entfernen -->
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${SITE}/${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="de_DE">
<link rel="icon" href="${root}assets/logo/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${root}assets/fonts/fraunces-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${root}assets/fonts/instrument-sans-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${root}assets/css/fonts.css">
<link rel="stylesheet" href="${root}assets/css/styles.css">${extraCss}
<script>document.documentElement.classList.remove('kein-js');</script>
</head>`;
}

function header(root, over = false) {
  return `<a class="skip" href="#inhalt">Zum Inhalt springen</a>
<header class="hdr${over ? ' hdr--over' : ''}">
  <div class="wrap">
    <a class="brand" href="${root}index.html" aria-label="Team Kornkammer, zur Startseite">
      <span class="brand__name">Team Kornkammer</span>
      <span class="brand__sub">Kornkammer Haus Holte · Witten</span>
    </a>
    <nav class="nav" aria-label="Hauptnavigation">
      <a href="${root}hof.html">Der Hof</a>
      <a href="${root}team.html">Das Team</a>
      <a href="${root}arbeit.html">Unsere Arbeit</a>
      <a href="${root}galerie.html">Galerie</a>
      <a href="${root}shop/">Sortiment</a>
      <a href="${root}kontakt.html">Hofverkauf &amp; Kontakt</a>
    </nav>
    <div class="hdr__tools">
      <button type="button" class="iconbtn cartbtn" aria-label="Warenkorb öffnen">${ico.cart}<span class="cartbtn__n" aria-live="polite">0</span></button>
      <button type="button" class="iconbtn burger" aria-expanded="false" aria-controls="menu" aria-label="Menü öffnen"><span class="l"></span></button>
    </div>
  </div>
</header>
<div class="menu" id="menu">
  <nav class="menu__list" aria-label="Mobile Navigation">
    <a href="${root}index.html">Start</a>
    <a href="${root}hof.html">Der Hof</a>
    <a href="${root}team.html">Das Team</a>
    <a href="${root}arbeit.html">Unsere Arbeit</a>
    <a href="${root}galerie.html">Galerie</a>
    <a href="${root}shop/">Sortiment</a>
    <a href="${root}kontakt.html">Hofverkauf &amp; Kontakt</a>
  </nav>
  <div class="menu__foot">
    <strong>Hofverkauf jeden Freitag, 8 bis 17 Uhr</strong>
    <span>Gederfeldweg 37, 58453 Witten</span>
    <a href="tel:+4923022827475">02302 282 7475</a>
  </div>
</div>`;
}

function footer(root) {
  return `<footer class="ftr">
  <div class="wrap">
    <div class="ftr__grid">
      <div class="ftr__brand">
        <span class="brand__name">Team Kornkammer</span>
        <p>Kornkammer Haus Holte. Bioland-Betrieb mitten im Ruhrgebiet, seit 1987. Getreide, Kartoffeln, Öle, Senf und Nudeln vom eigenen Acker.</p>
      </div>
      <div>
        <h4>Hofverkauf</h4>
        <ul>
          <li>Jeden Freitag 8 bis 17 Uhr</li>
          <li>Fällt ein Feiertag auf Freitag, am Donnerstag</li>
          <li>Gederfeldweg 37, 58453 Witten</li>
          <li><a href="tel:+4923022827475">02302 282 7475</a></li>
          <li><a href="mailto:Team-Kornkammer@gmx.de">Team-Kornkammer@gmx.de</a></li>
        </ul>
      </div>
      <div>
        <h4>Seiten</h4>
        <ul>
          <li><a href="${root}hof.html">Der Hof</a></li>
          <li><a href="${root}team.html">Das Team</a></li>
          <li><a href="${root}arbeit.html">Unsere Arbeit</a></li>
          <li><a href="${root}galerie.html">Galerie</a></li>
          <li><a href="${root}shop/">Sortiment</a></li>
          <li><a href="${root}kontakt.html">Hofverkauf &amp; Kontakt</a></li>
        </ul>
      </div>
      <div>
        <h4>Rechtliches</h4>
        <ul>
          <li><a href="${root}impressum.html">Impressum</a></li>
          <li><a href="${root}datenschutz.html">Datenschutz</a></li>
          <li><a href="https://shopteamkornkammer.company.site/" rel="noopener">Bestehender Onlineshop</a></li>
          <li><a href="https://www.instagram.com/teamkornkammer/" rel="noopener">Instagram</a></li>
        </ul>
      </div>
    </div>
    <div class="ftr__bottom">
      <span>© <span data-jahr>2026</span> Kornkammer Haus Holte oHG</span>
      <span>Bioland-Betrieb · Mitglied im Netzwerk Pilotbetriebe</span>
    </div>
  </div>
</footer>
<script src="${root}assets/js/main.js" defer></script>
<script src="${root}assets/js/shop.js" defer></script>
<script src="${root}assets/js/buehne.js" defer></script>
</body>
</html>`;
}

/* ---------- Lichtbühne (Stufe 1/2, siehe assets/js/buehne.js) ----------
   Konfiguration: data.praesentation.vorgaben[kategorie] + produkt.praesentation.
   Freigestelltes Bild, wenn vorhanden; sonst das erste Foto als Karte. */
export function stage(p, root, opts = {}) {
  const cat = data.kategorien.find((k) => k.id === p.kat);
  const pr = Object.assign({}, (data.praesentation && data.praesentation.vorgaben[p.kat]) || {}, p.praesentation || {});
  if (pr.aktiv === false) return '';
  const freiPfad = `assets/img/produkte/frei/${p.id}.webp`;
  const frei = pr.freigestellt !== false && existsSync(join(base, freiPfad));
  const foto = existsSync(join(base, 'assets/img', p.bilder[0]));
  if (!frei && !foto) return '';
  const src = frei ? root + freiPfad : root + 'assets/img/' + p.bilder[0];
  // Stufe 4: liegt ein Produktfilm vor (praesentation.video), ersetzt er das Standbild
  const video = pr.video && existsSync(join(base, pr.video)) ? root + pr.video : '';
  const objekt = video
    ? `<video class="stage3__img stage3__video" src="${video}" poster="${src}" muted playsinline loop preload="metadata" width="600" height="800" draggable="false"></video>`
    : `<img class="stage3__img" src="${src}" alt="" width="600" height="800" draggable="false" ${opts.home ? 'loading="lazy"' : 'fetchpriority="high"'}>`;
  const v0 = p.varianten.find((v) => v.preis != null) || p.varianten[0];
  const price = v0.preis != null ? eur(v0.preis) + ' <span class="small" style="color:var(--on-dark-m)">' + esc(v0.label) + '</span>' : 'Preis auf Anfrage';
  const title = opts.titel ? `<h2>${esc(p.name)}</h2>` : `<p class="stage3__title">${esc(p.name)}</p>`;
  const actions = opts.home
    ? `<a class="btn btn--solidlight" href="${root}shop/produkte/${p.id}.html">Produkt entdecken</a><a class="btn btn--light" href="${root}shop/">Ganzes Sortiment</a>`
    : `<a class="btn btn--solidlight" href="#kaufen">Jetzt bestellen</a><a class="btn btn--light" href="#bilder">Weitere Bilder</a>`;
  return `<section class="stage3 stage3--${p.kat}${opts.home ? ' stage3--home' : ''}" data-stage data-partikel="${esc(pr.partikel || 'hell')}" aria-label="${esc(p.name)} im Licht">
  <div class="stage3__bg"></div>
  <canvas class="stage3__fx" aria-hidden="true"></canvas>
  <div class="stage3__sweep" aria-hidden="true"></div>
  <div class="stage3__floor" aria-hidden="true"></div>
  <div class="stage3__scene">
    <div class="stage3__obj${frei ? '' : ' stage3__obj--foto'}" tabindex="0" role="img" aria-label="${esc(p.name)}. Mit Pfeiltasten oder durch Ziehen drehen.">
      ${objekt}
      <img class="stage3__refl" src="${src}" alt="" aria-hidden="true" width="600" height="800" draggable="false" loading="lazy">
    </div>
  </div>
  <div class="stage3__cap">
    <p class="eyebrow">Ruhrtalgold · ${esc(cat.name)}</p>
    ${title}
    <p>${esc(p.kurz)}</p>
    <p class="stage3__price">${price}</p>
    <div class="stage3__actions">${actions}</div>
  </div>
  <p class="stage3__hint" aria-hidden="true">Ziehen zum Drehen</p>
</section>`;
}

/* ---------- Produktkarte ---------- */
function card(p, root, i) {
  const v0 = p.varianten.find((v) => v.preis != null) || p.varianten[0];
  const cat = data.kategorien.find((k) => k.id === p.kat);
  const cls = ['pcard', p.layout ? 'pcard--' + p.layout : '', 'rv', 'rv--d' + ((i % 4) + 1)].filter(Boolean).join(' ');
  const price = v0.preis != null ? eur(v0.preis) : 'Preis auf Anfrage';
  const addBtn = v0.preis != null
    ? `<button type="button" class="pcard__add" data-add data-id="${p.id}" data-name="${esc(p.name)}" data-variant="${esc(v0.label)}" data-price="${v0.preis}" data-max="${v0.max || 99}" data-img="assets/img/${p.bilder[0]}" data-url="shop/produkte/${p.id}.html" aria-label="${esc(p.name)} in den Korb">${ico.plus}</button>`
    : '';
  return `<article class="${cls}">
  <figure class="media media--tone-paper" data-ph="${esc(p.ph[0])}"><img src="${root}assets/img/${p.bilder[0]}" alt="${esc(p.name)}" loading="lazy" width="800" height="1000"></figure>
  ${p.hinweis ? `<span class="pcard__badge">Nachfragen</span>` : ''}${addBtn}
  <div class="pcard__body">
    <span class="pcard__cat">${esc(cat.name)}</span>
    <h3><a href="${root}shop/produkte/${p.id}.html">${esc(p.name)}</a></h3>
    <span class="pcard__price">${price}</span>
    <span class="pcard__unit">${esc(p.kurz)} · ${esc(v0.einheit)}${p.varianten.length > 1 ? ' und weitere Gebinde' : ''}</span>
  </div>
</article>`;
}

/* ---------- Sortiment ---------- */
function shopIndex() {
  const root = '../';
  const cats = data.kategorien.map((k) => {
    const items = data.produkte.filter((p) => p.kat === k.id);
    return `<section class="cat" id="${k.id}">
  <div class="cat__head">
    <div><p class="eyebrow">${esc(k.name)}</p><h2 class="rv">${esc(k.titel)}</h2></div>
    <p class="rv rv--d1">${esc(k.text)}</p>
  </div>
  <div class="pgrid">
${items.map((p, i) => card(p, root, i)).join('\n')}
  </div>
</section>`;
  }).join('\n');

  const html = `${head({ root, title: 'Sortiment · Team Kornkammer', desc: 'Senf, Speiseöle, Dinkelnudeln, Mehle, Körner, Flocken und Kartoffeln vom Bioland-Hof Kornkammer Haus Holte in Witten. Hofverkauf freitags, Bestellung per Anfrage.', canonical: 'shop/' })}
<body data-root="../">
${header(root)}
<main id="inhalt">
  <section class="pagehead">
    <div class="wrap">
      <p class="crumbs"><a href="../index.html">Start</a><span>/</span><span>Sortiment</span></p>
      <h1 class="rv-words">Was vom Acker kommt.</h1>
      <p class="lead rv rv--d1">Alles hier wächst auf unseren eigenen Flächen und wird auf dem Hof verarbeitet. Sie können es freitags am Gederfeldweg abholen oder über den Korb anfragen. Wir bestätigen Verfügbarkeit, Versand und Zahlung per E-Mail.</p>
    </div>
  </section>
  <section class="sec--s">
    <div class="wrap">
      <nav class="shopnav" aria-label="Kategorien">
${data.kategorien.map((k) => `        <a class="chip" href="#${k.id}">${esc(k.name)}</a>`).join('\n')}
      </nav>
      <div class="notice rv">${ico.info}<div><strong>Preise Stand Oktober 2026</strong>, inklusive 7 % Mehrwertsteuer, übernommen aus unserem Onlineshop. Wo kein Preis steht, nennen wir ihn Ihnen auf Anfrage. Im Onlineshop ist der Versand ab 50 € Bestellwert kostenfrei.</div></div>
${cats}
    </div>
  </section>
${stage(data.produkte.find((x) => x.id === 'dinkelmehl-630'), root, { home: true, titel: true })}
  <section class="sec sec--beige">
    <div class="wrap">
      <div class="split">
        <div class="split__text">
          <p class="eyebrow">Hofverkauf</p>
          <h2 class="rv">Oder Sie kommen einfach vorbei.</h2>
          <p class="rv rv--d1">Jeden Freitag von 8 bis 17 Uhr verkaufen wir direkt am Hof, Gederfeldweg 37 in Witten. Fällt ein Feiertag auf den Freitag, sind wir am Donnerstag da. Telefonische Absprachen sind ebenfalls möglich.</p>
          <a class="link rv rv--d2" href="../kontakt.html">Anfahrt und Zeiten ${ico.arrow}</a>
        </div>
        <figure class="media media--soft split__media rv rv--mask" data-ph="Hofverkauf am Freitag" style="--ar:4/3"><img src="../assets/img/hofverkauf.jpg" alt="Hofverkauf am Gederfeldweg" loading="lazy" width="1200" height="900"></figure>
      </div>
    </div>
  </section>
</main>
${footer(root)}`;
  writeFileSync(join(base, 'shop/index.html'), html);
}

/* ---------- Produktseite ---------- */
function productPage(p) {
  const root = '../../';
  const cat = data.kategorien.find((k) => k.id === p.kat);
  const v0 = p.varianten.find((v) => v.preis != null) || p.varianten[0];
  const related = data.produkte.filter((x) => x.kat === p.kat && x.id !== p.id).slice(0, 4);
  const slides = p.bilder.map((b, i) => `<figure class="media" data-ph="${esc(p.ph[i] || p.name)}"><img src="${root}assets/img/${b}" alt="${esc(p.name)}${i ? ', Detail' : ''}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} width="900" height="1125"></figure>`).join('\n          ');
  const thumbs = p.bilder.map((b, i) => `<button type="button" class="${i === 0 ? 'is-on' : ''}" aria-label="Bild ${i + 1}"><figure class="media" data-ph=""><img src="${root}assets/img/${b}" alt="" loading="lazy" width="200" height="200"></figure></button>`).join('\n          ');
  const variants = p.varianten.map((v, i) => `<label><input type="radio" name="variante" value="${esc(v.label)}" data-price="${v.preis != null ? v.preis : ''}" data-unit="${esc(v.grundpreis || '')}" data-max="${v.max || 99}" ${i === p.varianten.indexOf(v0) ? 'checked' : ''}>${esc(v.label)}${v.preis != null ? ` <small>${eur(v.preis)}</small>` : ' <small>auf Anfrage</small>'}</label>`).join('\n            ');
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.text.join(' '),
    brand: { '@type': 'Brand', name: 'Ruhrtalgold' },
    ...(p.ean ? { gtin13: p.ean } : {}),
    offers: p.varianten.filter((v) => v.preis != null).map((v) => ({ '@type': 'Offer', price: v.preis.toFixed(2), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition', name: v.label }))
  };
  if (!jsonld.offers.length) delete jsonld.offers;

  const html = `${head({ root, title: `${p.name} · Team Kornkammer`, desc: `${p.kurz}. ${p.text[0]}`, canonical: `shop/produkte/${p.id}.html` })}
<body data-root="../../">
${header(root, true)}
<main id="inhalt">
  ${stage(p, root)}
  <div class="wrap">
    <section class="pdp pdp--nach-buehne" id="bilder">
      <div class="pdp__gallery">
        <p class="crumbs"><a href="../../index.html">Start</a><span>/</span><a href="../">Sortiment</a><span>/</span><a href="../#${cat.id}">${esc(cat.name)}</a></p>
        <div class="gal" tabindex="0" aria-label="Produktbilder, mit Pfeiltasten wechseln">
          <div class="gal__slides">
          ${slides}
          </div>
          <button type="button" class="gal__full" aria-label="Bild groß anzeigen"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          <div class="gal__nav"><button type="button" data-dir="-1" aria-label="Vorheriges Bild"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><button type="button" data-dir="1" aria-label="Nächstes Bild"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>
        </div>
        <div class="gal__thumbs">
          ${thumbs}
        </div>
      </div>
      <div class="pdp__info" id="kaufen">
        <p class="eyebrow">${esc(cat.name)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="lead">${esc(p.kurz)}</p>
        <div class="pdp__price"><b data-price>${v0.preis != null ? eur(v0.preis) : 'Preis auf Anfrage'}</b><span data-unit>${esc(v0.grundpreis || '')}</span></div>
        <fieldset class="variants">
          <legend>Gebinde</legend>
          <div class="variants__list">
            ${variants}
          </div>
        </fieldset>
        <div class="buy">
          <div class="qty"><button type="button" data-q="-1" aria-label="Weniger">−</button><input type="number" value="1" min="1" max="${v0.max || 99}" aria-label="Menge"><button type="button" data-q="1" aria-label="Mehr">+</button></div>
          <button type="button" class="btn btn--solid" data-add data-id="${p.id}" data-name="${esc(p.name)}" data-variant="${esc(v0.label)}" data-price="${v0.preis != null ? v0.preis : ''}" data-max="${v0.max || 99}" data-img="assets/img/${p.bilder[0]}" data-url="shop/produkte/${p.id}.html" ${v0.preis == null ? 'disabled' : ''}>${v0.preis != null ? 'In den Korb' : 'Preis anfragen'}</button>
        </div>
        <p class="small" data-variant-hint ${v0.preis != null ? 'hidden' : ''}>Für dieses Gebinde nennen wir Ihnen den Preis auf Anfrage: <a href="../../kontakt.html">Kontakt</a>.</p>
        ${p.hinweis ? `<div class="notice">${ico.info}<div>${esc(p.hinweis)}</div></div>` : ''}
        <div class="pdp__desc">
          ${p.text.map((t) => `<p>${esc(t)}</p>`).join('\n          ')}
        </div>
        <div class="pdp__origin">
          <h3>Woher es kommt</h3>
          <p>${esc(p.herkunft)}</p>
          <a class="link" href="../../arbeit.html">So arbeiten wir ${ico.arrow}</a>
        </div>
        <dl class="pdp__meta">
          <div><dt>Erzeuger</dt><dd>Kornkammer Haus Holte, Witten</dd></div>
          <div><dt>Marke</dt><dd>Ruhrtalgold</dd></div>${p.ean ? `
          <div><dt>EAN</dt><dd>${p.ean}</dd></div>` : ''}
          <div><dt>Anbau</dt><dd>Bioland, seit 1987</dd></div>
          <div><dt>Abholung</dt><dd>Freitags 8 bis 17 Uhr am Hof</dd></div>
          <div><dt>Versand</dt><dd>Im Onlineshop ab 50 € kostenfrei, sonst zzgl. Versand</dd></div>
        </dl>
      </div>
    </section>
    ${related.length ? `<section class="related">
      <div class="head"><div><p class="eyebrow">Dazu passt</p><h2 class="rv">Mehr ${esc(cat.name)}</h2></div></div>
      <div class="pgrid">
${related.map((r, i) => card(r, root, i).replace('pcard--wide', '').replace('pcard--tall', '')).join('\n')}
      </div>
    </section>` : ''}
  </div>
  <dialog class="lightbox" aria-label="Bild in groß">
    <div class="lightbox__inner">
      <button type="button" class="lightbox__close" aria-label="Schließen"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <figure class="media" data-ph=""></figure>
    </div>
  </dialog>
</main>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
${footer(root)}`;
  writeFileSync(join(base, 'shop/produkte', p.id + '.html'), html);
}

mkdirSync(join(base, 'shop/produkte'), { recursive: true });
shopIndex();
data.produkte.forEach(productPage);
const mitBuehne = data.produkte.filter((p) => stage(p, '')).length;
const frei = data.produkte.filter((p) => existsSync(join(base, `assets/img/produkte/frei/${p.id}.webp`))).length;
console.log('Sortiment und ' + data.produkte.length + ' Produktseiten geschrieben; Lichtbühne auf ' + mitBuehne + ' Seiten, davon ' + frei + ' freigestellt.');
// Startseiten-Bühne für den Generator anderer Seiten verfügbar machen
if (process.argv.includes('--home')) {
  const p = data.produkte.find((x) => x.id === (process.argv[process.argv.indexOf('--home') + 1] || 'dinkelmehl-630'));
  process.stdout.write(stage(p, '', { home: true, titel: true }) + '\n');
}
