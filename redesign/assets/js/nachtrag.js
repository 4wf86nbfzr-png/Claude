/* ============================================================
   Nachtrag: zwei Funktionen aus der vorigen Fassung
   ------------------------------------------------------------
   Diese Datei laeuft NACH main.js und motion.js und fasst von beiden
   nichts an. Sie holt zwei Dinge nach, die in der Neugestaltung fehlen —
   und zwar nur Funktion, kein Aussehen: kein Pixel der Gestaltung
   aendert sich durch diese Datei.

   1. Die Kopfzeilenhoehe, die nicht mitwackelt
   2. Die Zahlen im Vertrauensband, die hochzaehlen
   ============================================================ */

(function () {
  'use strict';

  var ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==========================================================
     1. `--nav-h` ist die RESERVIERTE Hoehe, nicht die aktuelle
     ----------------------------------------------------------
     Die Kopfzeile ist oben 105 px hoch und gescrollt 73. An `--nav-h`
     haengen dreizehn Stellen, und JEDE davon will Platz unter einer
     festen Leiste reservieren: das Polster des Heros, der Kopf der
     Unterseiten, das Vollbildmenue, `scroll-padding-top`. Keine
     einzige will die gerade aktuelle Hoehe.

     Nachgemessen war der Wert vorher in beiden Richtungen falsch —
     geschrieben wurde er im selben Bild, in dem die Klasse faellt, also
     mitten in der Ueberblendung:

         oben          Leiste 105 px    --nav-h 105
         gescrollt     Leiste  73 px    --nav-h 105
         wieder oben   Leiste 105 px    --nav-h  73   <- falsch

     Sichtbar wurde das am Hero: er wuchs beim Zurueckscrollen von 900
     auf 914 px, weil seine Hoehe an `100svh - var(--nav-h)` haengt.

     Gemessen wird deshalb nur im RUHEZUSTAND; steht die Leiste gerade
     gescrollt da, wird der gemerkte Wert nur neu geschrieben. Warum
     nicht kurz umgeschaltet und dann gemessen wird, steht unten bei
     `schreiben()` — es war der erste Versuch, und er hat Unsinn
     gemessen.
     ========================================================== */
  var nav = document.querySelector('header.nav');
  if (nav) {
    var wurzel = document.documentElement;
    var zuletzt = 0;

    /* Gemessen wird NUR im Ruhezustand, und der wird abgewartet statt
       hergestellt. Der naheliegende Griff — Klasse kurz abnehmen,
       messen, wieder setzen — sieht richtig aus und misst Unsinn: die
       Umschaltung ist eine Ueberblendung, und `getBoundingClientRect()`
       liefert in dem Augenblick den laufenden Zwischenwert, nicht das
       Ziel. Nachgemessen kam dabei gescrollt 73 heraus statt der
       reservierten 105. Wer eine Hoehe misst, waehrend sie sich gerade
       aendert, misst eine Zwischenstellung.

       Solange die Leiste gescrollt steht, wird der gemerkte Wert also
       nur neu GESCHRIEBEN. Das ist noetig, weil `main.js` bei `resize`
       seinerseits `--nav-h` setzt; unser Zuhoerer ist spaeter
       angemeldet und hat das letzte Wort. */
    var ruhe = 0, veraltet = false;

    function schreiben() {
      if (!nav.classList.contains('scrolled')) {
        var h = Math.round(nav.getBoundingClientRect().height);
        if (h) { ruhe = h; veraltet = false; }
      } else if (!ruhe) {
        return;                       /* noch nie im Ruhezustand gesehen */
      }
      if (ruhe && ruhe !== zuletzt) {
        zuletzt = ruhe;
        wurzel.style.setProperty('--nav-h', ruhe + 'px');
      }
    }

    schreiben();

    /* Jede Umschaltung von `.scrolled` setzt den Wert neu — und wenn
       zwischendurch das Fenster seine Breite geaendert hat, wird beim
       naechsten Ruhezustand nachgemessen. */
    new MutationObserver(function () {
      if (veraltet && !nav.classList.contains('scrolled')) zuletzt = 0;
      schreiben();
    }).observe(nav, { attributes: true, attributeFilter: ['class'] });

    /* `main.js` schreibt denselben Wert bei `resize`. Unser Zuhoerer
       ist spaeter angemeldet und laeuft deshalb danach — der richtige
       Wert steht am Ende. */
    window.addEventListener('resize', function () {
      if (nav.classList.contains('scrolled')) { veraltet = true; zuletzt = 0; }
      schreiben();
    }, { passive: true });

    /* Die Schriften kommen nach dem ersten Bild, und das Wortzeichen
       bestimmt die Hoehe der Leiste mit. */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schreiben).catch(function () {});
    }

    /* Nach dem Ende der Ueberblendung noch einmal: `transitionend`
       blubbert, die Hoehe des Wortzeichens zaehlt also mit. Ein
       `getBoundingClientRect()` in jedem Scrollbild waere ein
       erzwungenes Layout je Bild — deshalb haengt es am Ende der
       Bewegung und nicht am Scrollen. */
    nav.addEventListener('transitionend', schreiben);
  }

  /* ==========================================================
     2. Die Zahlen im Vertrauensband zaehlen hoch
     ----------------------------------------------------------
     Vier Dinge daran sind nicht beliebig:

     1. Der fertige Wert steht im Markup. Ohne Skript und bei
        reduzierter Bewegung steht die Zahl damit einfach da. Eine
        „0", die erst ein Skript fuellt, waere eine falsche Angabe
        ueber den Betrieb, solange es nicht laeuft.
     2. Die Breite wird vorher reserviert, und zwar auf die breiteste
        ZWISCHENstellung. Die letzte reicht nicht: zwischen 0 und 20
        steht auch die 18, und je nach Schrift ist die breiter als die
        20. Danach wird die Reservierung wieder freigegeben — sie
        steht in Pixeln, die Schriftgroesse aber in vw.
     3. Gezaehlt wird einmal. Eine Zahl, die bei jedem Vorbeiscrollen
        neu hochlaeuft, ist ein Effekt und keine Angabe.
     4. Kein `aria-live`. Sonst liest ein Vorlesewerkzeug jede
        Zwischenstellung vor, also sechzig Ansagen fuer eine Zahl.
     ========================================================== */
  var zahlen = [].slice.call(document.querySelectorAll('.zahl[data-ziel]'));
  if (zahlen.length && !ruhig && 'IntersectionObserver' in window) {
    var DAUER = 1150;

    function breiteReservieren(el, ziel) {
      var merk = el.textContent, breit = 0;
      var schritt = Math.max(1, Math.ceil((ziel + 1) / 200));
      for (var i = 0; i <= ziel; i += schritt) {
        el.textContent = String(i);
        breit = Math.max(breit, el.getBoundingClientRect().width);
      }
      el.textContent = merk;
      breit = Math.max(breit, el.getBoundingClientRect().width);
      el.style.minWidth = breit.toFixed(2) + 'px';
    }

    function zaehlen(el, ziel) {
      var start = performance.now();
      (function bild(jetzt) {
        var t = Math.min(1, (jetzt - start) / DAUER);
        var p = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(ziel * p));
        if (t < 1) { requestAnimationFrame(bild); return; }
        el.textContent = String(ziel);
        el.style.minWidth = '';
      })(start);
    }

    var beo = new IntersectionObserver(function (eintraege) {
      for (var k = 0; k < eintraege.length; k++) {
        var e = eintraege[k];
        if (!e.isIntersecting) continue;
        beo.unobserve(e.target);
        var ziel = parseInt(e.target.dataset.ziel, 10);
        if (!isFinite(ziel)) continue;
        breiteReservieren(e.target, ziel);
        e.target.textContent = '0';
        zaehlen(e.target, ziel);
      }
    }, { threshold: 0.6 });

    zahlen.forEach(function (z) { beo.observe(z); });
  }
})();
