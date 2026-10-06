/* ============================================================
   Sieben Zusaetze, der bewegliche Teil
   ------------------------------------------------------------
   Laeuft NACH main.js, motion.js, musik.js, nachtrag.js und
   hintergrundfilm.js und fasst von keinem davon etwas an. Kein
   vorhandener Zuhoerer wird ersetzt, keine vorhandene Schleife
   uebernommen — diese Datei bringt ihre eigene mit und meldet sie ab,
   sobald nichts mehr zu sehen ist.

   Was hier drinsteht:

     1. Werkzeugleiste        zwei Knoepfe, unten links
     2. Dunkelstufe           tief / weich, gemerkt
     3. Sprungpalette         Strg/Cmd+K, Schraegstrich
     4. Kapitelrail           ein Punkt je Abschnitt
     5. Scrollspur `--durch`  fuer Collage, Laufband, 3D-Zeichen
     6. 3D-Kippen am Zeiger
     7. Magnetische Knoepfe

   Zwei Regeln des Hauses gelten durchgehend:

   * ERST MESSEN, DANN SCHREIBEN. Jedes Schreiben macht das Layout
     ungueltig, jedes folgende Lesen erzwingt es neu. Die Schleife
     sammelt deshalb alle Rechtecke in einem Zug und schreibt erst
     danach.
   * KEINE EBENE AUF VORRAT. `will-change` haengt an einer Klasse, die
     nur gesetzt ist, solange das Element wirklich zu sehen ist.
   ============================================================ */

(function () {
  'use strict';

  var d = document;
  var ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var feinerZeiger = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ----------------------------------------------------------
     Der Pfad zur Wurzel
     ----------------------------------------------------------
     Die sechs Bereichsseiten liegen einen Ordner tiefer. Geraten wird
     das NICHT aus `location.pathname` — in der Testdatei steht dort
     `about:srcdoc`, und die Palette zeigte dann auf lauter Adressen,
     die es nicht gibt. Abgelesen wird es an einem Link, den jede Seite
     ohnehin traegt.
     ---------------------------------------------------------- */
  var wurzel = '';
  (function () {
    var a = d.querySelector('a[href$="index.html"]');
    if (!a) return;
    var h = a.getAttribute('href') || '';
    wurzel = h.slice(0, h.length - 'index.html'.length);
  })();

  /* Jede Seite der Website, in der Reihenfolge des Menues. Die sechs
     Bereiche stehen mit ihrem Ordner da; `wurzel` kommt davor. */
  var SEITEN = [
    ['Start', 'index.html'],
    ['Dienstleistungen', 'dienstleistungen.html'],
    ['Gastro-Personal', 'dienstleistungen/gastro-personal.html'],
    ['Sicherheit', 'dienstleistungen/sicherheit.html'],
    ['Promotion & Hostess', 'dienstleistungen/promotion-hostess.html'],
    ['Logistik', 'dienstleistungen/logistik.html'],
    ['Fahrservice', 'dienstleistungen/fahrservice.html'],
    ['Reinigung', 'dienstleistungen/reinigung.html'],
    ['Referenzen', 'referenzen.html'],
    ['Team', 'team.html'],
    ['Galerie', 'galerie.html'],
    ['Jobs', 'jobs.html'],
    ['Kontakt', 'kontakt.html'],
    ['Impressum', 'impressum.html'],
    ['Datenschutz', 'datenschutz.html']
  ];

  function el(tag, klasse, text) {
    var n = d.createElement(tag);
    if (klasse) n.className = klasse;
    if (text != null) n.textContent = text;
    return n;
  }

  /* SVG kommt als Zeichenkette: zwoelf `createElementNS`-Aufrufe fuer
     einen Haken sind kein Gewinn an Lesbarkeit. */
  function symbol(pfade) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + pfade + '</svg>';
  }
  var ICON_SUCHE = symbol('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>');
  var ICON_HELL = symbol('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/>');
  var ICON_DUNKEL = symbol('<path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z"/>');

  /* ==========================================================
     1 + 2. Werkzeugleiste und Dunkelstufe
     ----------------------------------------------------------
     Die Leiste wird gebaut, nicht ins Markup geschrieben. Sechzehn
     Kopien desselben Bauteils laufen beim naechsten Eingriff
     auseinander — dieselbe Begruendung wie bei den Unterleisten der
     Kopfzeile, die `main.js` ebenfalls baut.
     ========================================================== */
  var STUFE_SCHLUESSEL = 'hst-dunkelstufe';

  function stufeLesen() {
    try {
      var v = localStorage.getItem(STUFE_SCHLUESSEL);
      return v === 'weich' ? 'weich' : 'tief';
    } catch (e) {
      return 'tief';
    }
  }
  function stufeSetzen(wert, knopf) {
    d.documentElement.setAttribute('data-dunkel', wert);
    try { localStorage.setItem(STUFE_SCHLUESSEL, wert); } catch (e) {}
    if (!knopf) return;
    var weich = wert === 'weich';
    knopf.setAttribute('aria-pressed', weich ? 'true' : 'false');
    knopf.setAttribute('aria-label', weich
      ? 'Dunkelstufe: weich. Auf tiefes Schwarz umschalten'
      : 'Dunkelstufe: tief. Auf weiches Schwarz umschalten');
    /* Nur das Symbol tauschen, nicht den ganzen Knopf: `innerHTML` am
       Knopf haette im Vollbildmenue die Beschriftung mit weggeworfen —
       und zwar erst beim ersten Umschalten, also genau dann, wenn
       niemand mehr hinsieht. */
    var sym = knopf.querySelector('.werkzeuge__sym');
    if (sym) sym.innerHTML = weich ? ICON_HELL : ICON_DUNKEL;
    /* Die Farbe der Adressleiste am Telefon haengt an einer Angabe im
       Seitenkopf. Bliebe sie stehen, haette die weiche Stufe oben einen
       schwarzen Streifen, den es auf der Seite nicht mehr gibt. */
    var t = d.querySelector('meta[name="theme-color"]');
    if (t) t.setAttribute('content', weich ? '#101217' : '#000000');
  }

  /* Die gemerkte Stufe gilt sofort, noch bevor die Leiste steht —
     sonst blitzt beim Laden eine Stufe auf, die niemand gewaehlt hat. */
  stufeSetzen(stufeLesen(), null);

  /* ---- Wo die Leiste steht, und warum nicht ueberall gleich ----
     Am Schreibtisch schwebt sie unten links. Am TELEFON geht das nicht:
     eine feste Flaeche von zweimal 44 px liegt dort zwangslaeufig auf
     dem Inhalt, und nachgemessen hat sie genau das getan — sie deckte
     unter dem grossen Zitat den Namen „Tim Maelzer" zu.

     Zwei schwebende Bedienelemente an einem 390-px-Schirm sind eines zu
     viel; „Nach oben" rechts gibt es schon. Am Telefon wandern die
     beiden deshalb ins Vollbildmenue — dorthin, wo die Navigation
     ohnehin steht. */
  var imMenue = window.matchMedia('(max-width: 980px) and (pointer: coarse)').matches;
  var menue = d.getElementById('mobileMenu');
  var burger = d.getElementById('burger');

  var werkzeuge = el('div', 'werkzeuge' + (imMenue && menue ? ' werkzeuge--immenue' : ''));
  werkzeuge.setAttribute('aria-label', 'Werkzeuge');
  werkzeuge.setAttribute('role', 'group');

  var knopfSuche = el('button', 'werkzeuge__knopf werkzeuge__knopf--suche neu neu--knopf');
  knopfSuche.type = 'button';
  knopfSuche.setAttribute('aria-label', 'Seiten durchsuchen und springen');
  knopfSuche.setAttribute('aria-expanded', 'false');
  knopfSuche.innerHTML = ICON_SUCHE +
    '<span class="werkzeuge__text">Suchen</span>' +
    '<span class="werkzeuge__taste">' +
    (/Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘K' : 'Strg K') + '</span>';

  var knopfStufe = el('button', 'werkzeuge__knopf neu neu--knopf');
  knopfStufe.type = 'button';
  knopfStufe.innerHTML = '<span class="werkzeuge__sym"></span>' +
    '<span class="werkzeuge__text">Dunkelstufe</span>';
  stufeSetzen(stufeLesen(), knopfStufe);
  knopfStufe.addEventListener('click', function () {
    stufeSetzen(d.documentElement.getAttribute('data-dunkel') === 'weich' ? 'tief' : 'weich', knopfStufe);
  });

  werkzeuge.appendChild(knopfSuche);
  werkzeuge.appendChild(knopfStufe);
  if (imMenue && menue) menue.appendChild(werkzeuge); else d.body.appendChild(werkzeuge);

  /* Steht die Leiste im Menue, muss das Menue zugehen, bevor die
     Palette aufgeht — sonst liegen zwei Overlays uebereinander, und
     nach dem Schliessen der Palette steht das Menue noch offen da.
     Zugemacht wird ueber den vorhandenen Knopf, nicht ueber eine zweite
     Mechanik daneben. */
  function menueSchliessen() {
    if (burger && burger.getAttribute('aria-expanded') === 'true') burger.click();
  }

  /* ==========================================================
     3. Die Sprungpalette
     ----------------------------------------------------------
     Ein zweiter Weg durch die Website, mit der Tastatur. Sie ERSETZT
     nichts: Kopfzeile, Vollbildmenue, App-Leiste und der Fuss bleiben,
     wie sie sind.
     ========================================================== */
  var palette = el('div', 'palette');
  palette.id = 'palette';
  palette.setAttribute('role', 'dialog');
  palette.setAttribute('aria-modal', 'true');
  palette.setAttribute('aria-label', 'Springen zu');
  palette.innerHTML =
    '<div class="palette__kasten neu">' +
      '<div class="palette__feld neu--tief">' + ICON_SUCHE +
        '<input type="search" autocomplete="off" spellcheck="false" ' +
        'aria-label="Suchbegriff" placeholder="Seite oder Abschnitt suchen" />' +
      '</div>' +
      '<ul class="palette__liste" role="listbox" aria-label="Treffer"></ul>' +
      '<p class="palette__fuss">Pfeiltasten wählen, Enter springt, Esc schließt.</p>' +
    '</div>';
  d.body.appendChild(palette);
  knopfSuche.setAttribute('aria-controls', 'palette');

  var feld = palette.querySelector('input');
  var liste = palette.querySelector('.palette__liste');
  var fuss = palette.querySelector('.palette__fuss');
  var eintraege = [];
  var treffer = [];
  var wahl = 0;
  var vorFokus = null;

  /* Die Abschnitte der Seite, auf der man gerade steht: ueberall dort,
     wo es eine Ueberschrift gibt, auf die man auch springen kann. */
  /* Eine Ueberschrift kuerzen, ohne mitten im Wort zu schneiden. Fuer
     die Rail: dort steht die Beschriftung in einer Zeile, und
     „Wir stellen die Leute, die Ihr Event am Laufen halten." ist keine
     Beschriftung mehr, sondern ein Satz. */
  function kuerzen(s, max) {
    if (s.length <= max) return s;
    var schnitt = s.lastIndexOf(' ', max);
    return s.slice(0, schnitt > max * 0.5 ? schnitt : max).replace(/[,;:.\s]+$/, '') + '…';
  }

  function abschnitteSammeln() {
    var raus = [];
    var gesehen = {};
    [].slice.call(d.querySelectorAll('main [id]')).forEach(function (n) {
      if (!n.id || gesehen[n.id]) return;
      /* Das Kopfbild ist kein Kapitel, sondern der Anfang. Seine
         Ueberschrift ist der Titel der Seite — als Eintrag gelesen
         stuende dort „Personal, das Ihr Event traegt." neben fuenf
         Kapitelnamen. */
      if (n.id === 'hero' || n.classList.contains('hero')) return;
      var h = n.matches('h1,h2,h3') ? n : n.querySelector('h1,h2,h3');
      if (!h) return;
      var name = (h.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length > 90) return;
      gesehen[n.id] = 1;
      raus.push({ art: 'Abschnitt', name: name, kurz: kuerzen(name, 30), ziel: '#' + n.id });
    });
    return raus;
  }

  function aufbauen() {
    eintraege = SEITEN.map(function (s) {
      return { art: 'Seite', name: s[0], ziel: wurzel + s[1] };
    });
    eintraege.push({ art: 'Extern', name: 'Catering, Stullenwerk', ziel: 'https://stullenwerk.com', extern: true });
    eintraege = eintraege.concat(abschnitteSammeln());
  }

  /* Eine Suche, die nur den Anfang vergleicht, findet „Reinigung" nicht
     unter „nigung" — und eine, die beliebige Buchstabenfolgen zulaesst,
     findet alles unter allem. Verglichen wird deshalb auf Teilwoerter:
     jedes eingegebene Wort muss irgendwo vorkommen. */
  function passt(e, worte) {
    var heu = (e.name + ' ' + e.art).toLowerCase();
    for (var i = 0; i < worte.length; i++) {
      if (heu.indexOf(worte[i]) === -1) return false;
    }
    return true;
  }

  function zeichnen() {
    var txt = feld.value.trim().toLowerCase();
    var worte = txt ? txt.split(/\s+/) : [];
    treffer = worte.length ? eintraege.filter(function (e) { return passt(e, worte); }) : eintraege;
    if (wahl >= treffer.length) wahl = 0;
    liste.innerHTML = '';
    if (!treffer.length) {
      var leer = el('li', 'palette__leer', 'Nichts gefunden.');
      leer.setAttribute('role', 'presentation');
      liste.appendChild(leer);
      return;
    }
    treffer.forEach(function (e, i) {
      var li = el('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === wahl ? 'true' : 'false');
      var a = el('a');
      a.href = e.ziel;
      if (e.extern) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.appendChild(el('span', 'palette__art', e.art));
      a.appendChild(el('span', null, e.name));
      a.addEventListener('click', function () { schliessen(); });
      li.appendChild(a);
      liste.appendChild(li);
    });
    halten();
  }

  function halten() {
    var li = liste.children[wahl];
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  }

  function oeffnen() {
    if (palette.classList.contains('auf')) return;
    vorFokus = d.activeElement;
    aufbauen();
    feld.value = '';
    wahl = 0;
    zeichnen();
    palette.classList.add('auf');
    knopfSuche.setAttribute('aria-expanded', 'true');
    /* Das Scrollen dahinter anhalten. Lenis hat dafuer einen eigenen
       Schalter; ohne Lenis genuegt `overflow:hidden` am Dokument. */
    if (window.lenis && typeof window.lenis.stop === 'function') window.lenis.stop();
    d.documentElement.style.overflow = 'hidden';
    /* Erst im naechsten Bild fokussieren: solange `visibility:hidden`
       noch gilt, nimmt das Feld keinen Fokus an. */
    requestAnimationFrame(function () { feld.focus(); });
  }

  function schliessen() {
    if (!palette.classList.contains('auf')) return;
    palette.classList.remove('auf');
    knopfSuche.setAttribute('aria-expanded', 'false');
    if (window.lenis && typeof window.lenis.start === 'function') window.lenis.start();
    d.documentElement.style.overflow = '';
    if (vorFokus && vorFokus.focus) vorFokus.focus();
    vorFokus = null;
  }

  knopfSuche.addEventListener('click', function () {
    if (palette.classList.contains('auf')) { schliessen(); return; }
    menueSchliessen();
    oeffnen();
  });
  palette.addEventListener('mousedown', function (ev) {
    if (ev.target === palette) schliessen();
  });
  feld.addEventListener('input', function () { wahl = 0; zeichnen(); });

  feld.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!treffer.length) return;
      wahl = (wahl + (ev.key === 'ArrowDown' ? 1 : treffer.length - 1)) % treffer.length;
      [].slice.call(liste.children).forEach(function (li, i) {
        li.setAttribute('aria-selected', i === wahl ? 'true' : 'false');
      });
      halten();
    } else if (ev.key === 'Enter') {
      var li = liste.children[wahl];
      var a = li && li.querySelector('a');
      if (a) { ev.preventDefault(); a.click(); }
    }
  });

  d.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && palette.classList.contains('auf')) {
      ev.preventDefault();
      schliessen();
      return;
    }
    /* Der Schraegstrich darf nicht zuschlagen, waehrend jemand in ein
       Feld schreibt — im Anfrageformular stehen sechzehn davon. */
    var z = ev.target;
    var schreibt = z && (z.tagName === 'INPUT' || z.tagName === 'TEXTAREA' ||
      z.tagName === 'SELECT' || z.isContentEditable);
    if ((ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      oeffnen();
    } else if (ev.key === '/' && !schreibt && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault();
      oeffnen();
    }
  });

  /* Der Fokus bleibt im Dialog. Ohne das tabbt man hinter die Palette
     in eine Seite, die man gerade nicht sieht. */
  palette.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Tab') return;
    var fokussierbar = palette.querySelectorAll('input, a[href], button');
    if (!fokussierbar.length) return;
    var erst = fokussierbar[0], letzt = fokussierbar[fokussierbar.length - 1];
    if (ev.shiftKey && d.activeElement === erst) { ev.preventDefault(); letzt.focus(); }
    else if (!ev.shiftKey && d.activeElement === letzt) { ev.preventDefault(); erst.focus(); }
  });

  /* ==========================================================
     4. Die Kapitelrail
     ----------------------------------------------------------
     Links, ein Punkt je Abschnitt. Gebaut wird sie nur, wenn es
     mindestens drei Abschnitte gibt — bei zweien ist eine Rail eine
     Behauptung ueber eine Gliederung, die es nicht gibt.
     ========================================================== */
  var kapitel = null, kapitelZiele = [];
  (function () {
    if (!window.matchMedia('(min-width: 1200px)').matches || !feinerZeiger) return;
    var abs = abschnitteSammeln();
    if (abs.length < 3) return;
    kapitel = el('ul', 'kapitel');
    kapitel.setAttribute('aria-label', 'Abschnitte dieser Seite');
    abs.forEach(function (a) {
      var li = el('li');
      var link = el('a');
      link.href = a.ziel;
      link.appendChild(el('i'));
      link.appendChild(el('span', null, a.kurz || a.name));
      /* Der volle Name bleibt als zugaenglicher Name stehen: die
         gekuerzte Fassung ist Gestaltung, nicht Inhalt. */
      link.setAttribute('aria-label', a.name);
      li.appendChild(link);
      kapitel.appendChild(li);
      kapitelZiele.push({ link: link, knoten: d.getElementById(a.ziel.slice(1)) });
    });
    d.body.appendChild(kapitel);
  })();

  /* ==========================================================
     5. Die Scrollspur
     ----------------------------------------------------------
     `--durch` laeuft von 0 auf 1, waehrend ein Element durch das
     Fenster wandert. Was daraus wird — Versatz der Collagenstuecke, die
     Fahrt des Laufbands, die Drehung des 3D-Zeichens —, entscheidet
     allein das Stylesheet.

     Bei reduzierter Bewegung wird gar nichts angemeldet. Die
     Vorgabewerte in `var(--durch, .5)` ergeben dann genau die ruhige
     Fassung; das ist billiger und sicherer, als hinterher etwas
     zurueckzudrehen.
     ========================================================== */
  var spuren = [].slice.call(d.querySelectorAll('[data-durch]'));
  var kippbar = [];
  var magnete = [];

  if (!ruhig && spuren.length && 'IntersectionObserver' in window) {
    var sichtbar = [];
    var beo = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        var i = sichtbar.indexOf(e.target);
        if (e.isIntersecting) {
          e.target.classList.add('sicht');
          if (i === -1) sichtbar.push(e.target);
        } else {
          e.target.classList.remove('sicht');
          if (i !== -1) sichtbar.splice(i, 1);
        }
      });
      if (sichtbar.length && !laeuft) { laeuft = true; requestAnimationFrame(schleife); }
    }, { rootMargin: '140px 0px' });
    spuren.forEach(function (n) { beo.observe(n); });

    var laeuft = false;
    var schleife = function () {
      if (!sichtbar.length) { laeuft = false; return; }
      /* ERST MESSEN … */
      var h = window.innerHeight;
      var masse = sichtbar.map(function (n) { return n.getBoundingClientRect(); });
      /* … DANN SCHREIBEN. */
      for (var i = 0; i < sichtbar.length; i++) {
        var r = masse[i];
        var weg = h + r.height;
        var p = weg > 0 ? (h - r.top) / weg : 0;
        sichtbar[i].style.setProperty('--durch', (p < 0 ? 0 : p > 1 ? 1 : p).toFixed(4));
      }
      requestAnimationFrame(schleife);
    };
  }

  /* Die Kapitelmarke folgt dem Scrollen. Sie haengt NICHT an der
     Schleife oben: die laeuft nur, solange eine Spur zu sehen ist, und
     die Rail steht auf jeder Seite. Ein eigener Beobachter kostet
     nichts und misst nie. */
  if (kapitelZiele.length && 'IntersectionObserver' in window) {
    var aktiv = null;
    var beoK = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (!e.isIntersecting) return;
        kapitelZiele.forEach(function (z) {
          var an = z.knoten === e.target;
          if (an && aktiv !== z.link) {
            if (aktiv) aktiv.removeAttribute('aria-current');
            z.link.setAttribute('aria-current', 'true');
            aktiv = z.link;
          }
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    kapitelZiele.forEach(function (z) { if (z.knoten) beoK.observe(z.knoten); });
  }

  /* ==========================================================
     6. 3D: Kippen am Zeiger
     ----------------------------------------------------------
     Ein Zuhoerer am Dokument statt einer je Kachel: bei dreizehn
     Galeriekacheln waeren das sechsundzwanzig Zuhoerer fuer eine Sache,
     die ohnehin nur an einer Stelle gleichzeitig passiert.
     ========================================================== */
  if (feinerZeiger && !ruhig) {
    /* Nur zwei Sorten, und beide aus einem Grund:

       Die Collagenstuecke bekommen KEINE Neigung. Sie sind bereits
       gedreht und laufen beim Scrollen mit eigenem Tempo — eine dritte
       Bewegung auf demselben Element waere die zweite Geste auf
       derselben Zeile, und die liest als Effekt statt als Schnitt.

       Das Vertrauensband bekommt ebenfalls keine: seine vier Angaben
       stehen an einer gemeinsamen Linie, und ein gekipptes Viertel
       bricht genau die. */
    kippbar = [].slice.call(d.querySelectorAll('.gal__item, .versprechen > div'));
    kippbar.forEach(function (n) {
      n.setAttribute('data-kipp', '');
      if (!n.querySelector(':scope > .glanz')) {
        var g = el('span', 'glanz');
        g.setAttribute('aria-hidden', 'true');
        n.appendChild(g);
      }
    });

    var imGriff = null, zeigerX = 0, zeigerY = 0, wartet = false;

    d.addEventListener('pointermove', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      zeigerX = ev.clientX;
      zeigerY = ev.clientY;
      if (wartet) return;
      wartet = true;
      requestAnimationFrame(kippen);
    }, { passive: true });

    function kippen() {
      wartet = false;
      var ziel = d.elementFromPoint(zeigerX, zeigerY);
      var kachel = ziel && ziel.closest ? ziel.closest('[data-kipp]') : null;
      if (kachel !== imGriff && imGriff) loslassen(imGriff);
      imGriff = kachel;
      if (!kachel) return;
      var r = kachel.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var x = (zeigerX - r.left) / r.width;
      var y = (zeigerY - r.top) / r.height;
      var max = parseFloat(getComputedStyle(d.documentElement).getPropertyValue('--kipp-max')) || 7;
      kachel.classList.add('kippt');
      kachel.style.setProperty('--ry', ((x - 0.5) * 2 * max).toFixed(2));
      kachel.style.setProperty('--rx', ((0.5 - y) * 2 * max).toFixed(2));
      kachel.style.setProperty('--zx', x.toFixed(3));
      kachel.style.setProperty('--zy', y.toFixed(3));
    }

    function loslassen(n) {
      n.classList.remove('kippt');
      n.style.setProperty('--rx', '0');
      n.style.setProperty('--ry', '0');
    }

    /* Verlaesst der Zeiger das Fenster, kommt kein `pointermove` mehr —
       die zuletzt gekippte Kachel bliebe schraeg stehen. */
    d.addEventListener('pointerleave', function () {
      if (imGriff) { loslassen(imGriff); imGriff = null; }
    });
    window.addEventListener('blur', function () {
      if (imGriff) { loslassen(imGriff); imGriff = null; }
    });
  }

  /* ==========================================================
     7. Magnetische Knoepfe
     ----------------------------------------------------------
     Hoechstens acht Pixel. Ein Knopf, der weiter ausweicht, ist ein
     Knopf, den man nicht trifft — und das waere auf einer Seite, deren
     Ziel eine Anfrage ist, ein schlechtes Geschaeft.
     ========================================================== */
  if (feinerZeiger && !ruhig) {
    var WEITE = 8;
    magnete = [].slice.call(d.querySelectorAll('.btn, .nav__cta a, .werkzeuge__knopf'));
    magnete.forEach(function (n) { n.setAttribute('data-magnet', ''); });

    magnete.forEach(function (n) {
      n.addEventListener('pointermove', function (ev) {
        if (ev.pointerType && ev.pointerType !== 'mouse') return;
        var r = n.getBoundingClientRect();
        n.classList.add('zieht');
        n.style.setProperty('--mx-knopf', (((ev.clientX - r.left) / r.width - 0.5) * 2 * WEITE).toFixed(1) + 'px');
        n.style.setProperty('--my-knopf', (((ev.clientY - r.top) / r.height - 0.5) * 2 * WEITE).toFixed(1) + 'px');
      }, { passive: true });
      n.addEventListener('pointerleave', function () {
        n.classList.remove('zieht');
        n.style.setProperty('--mx-knopf', '0px');
        n.style.setProperty('--my-knopf', '0px');
      });
      /* Nach einem Klick liegt der Knopf verschoben da, waehrend die
         naechste Seite laedt. Zuruecksetzen, bevor er weggeht. */
      n.addEventListener('click', function () {
        n.classList.remove('zieht');
        n.style.setProperty('--mx-knopf', '0px');
        n.style.setProperty('--my-knopf', '0px');
      });
    });
  }
})();
