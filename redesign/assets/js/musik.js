/* ============================================================
   Die Hintergrundmusik am Tonschalter
   ------------------------------------------------------------
   Laeuft NACH motion.js und fasst von dort nichts an. motion.js baut den
   Schalter oben rechts und die synthetischen Bedienklaenge (Tick auf
   Links, Schlag auf Knoepfen); diese Datei haengt die Musik an denselben
   Schalter. Beide Fassungen bleiben: Ton an heisst Musik UND Klaenge,
   Ton aus heisst Stille.

   WARUM EIN EIGENES SKRIPT UND KEINE AENDERUNG AN motion.js
   motion.js liegt minifiziert in der gelieferten Fassung. Eine zweite
   Datei daneben ist nachlesbar, und sie faellt sauber aus, wenn jemand
   sie weglaesst: dann bleibt der Schalter genau der, der er vorher war.

   DREI DINGE, DIE NICHT BELIEBIG SIND

   1. Es wird NICHTS geladen, bevor der Schalter das erste Mal auf „an"
      steht. Die beiden Dateien wiegen zusammen 2,4 MB, und das ist mehr
      als die ganze Startseite an Bildern laedt. Wer den Schalter nie
      anfasst, zahlt null Byte. Deshalb entsteht das <audio> hier im
      Skript und nicht im Markup: ein Element mit `src` im Markup laedt
      auf manchen Browsern trotz `preload="none"` die ersten Bloecke.

   2. Die beiden Adressen haengen als `data-`Attribute am Schalter, nicht
      als Zeichenkette hier drin. Auf den sechs Bereichsseiten steht
      `../assets/…` statt `assets/…`, und eine Adresse, die im Skript
      steht, waere dort falsch. Dasselbe Verfahren wie beim
      Hintergrundfilm.

   3. H.264/AAC steht NICHT zuerst wie beim Film, sondern zweitens.
      Beim Film war die Hardware-Dekodierung das Argument, weil er
      dauernd laeuft. Eine Tonspur kostet nichts davon; hier zaehlt nur,
      dass Opus bei gleicher Guete kleiner ist (999 statt 1379 KB). Die
      AAC-Fassung steht daneben fuer Safari, das Opus in WebM nicht
      zuverlaessig abspielt. Ein iPhone, auf dem der Schalter nichts tut,
      waere ein Knopf ohne Funktion.

   DIE LAUTSTAERKE ist gerechnet, nicht gedreht. Die Datei steht auf
   −18 LUFS, also auf dem Pegel, den auch der Imagefilm traegt. Gespielt
   wird sie bei 0,45, das sind −6,9 dB und damit rund −25 LUFS am Ohr:
   hoerbar, aber unter jeder Stimme und jedem Systemton. Wer sie lauter
   will, dreht an PEGEL und an nichts sonst.
   ============================================================ */
(function () {
  'use strict';

  var schalter = [].slice.call(document.querySelectorAll('.ton'));
  if (!schalter.length) return;

  var erster = schalter[0];
  var webm = erster.getAttribute('data-musik-webm');
  var m4a = erster.getAttribute('data-musik-m4a');
  if (!webm && !m4a) return;

  /* Bei reduzierter Bewegung bleibt der Schalter, was er war: die
     Bedienklaenge aus motion.js. Eine dauernd laufende Musikspur ist
     zwar keine Bewegung, aber derselbe Wunsch nach Ruhe, und sie liesse
     sich nur ueber denselben Schalter wieder abstellen. */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var PEGEL = 0.45;
  var BLENDE = 900;          /* ms, Ein- und Ausblende */

  var audio = null;
  var laeuft = false;
  var blende = null;

  function anlegen() {
    if (audio) return audio;
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';
    audio.volume = 0;
    /* Die Schleife ist so geschnitten, dass die Naht nicht zu hoeren ist:
       die Ausblende der Vorlage ist weg, und die letzten zwei Sekunden
       sind ueber die ersten zwei geblendet. Gemessen springt der Pegel an
       der Naht um 1,8 dB, waehrend die Musik von sich aus um bis zu
       7,7 dB schwankt. */
    for (var i = 0; i < 2; i++) {
      var adresse = i === 0 ? webm : m4a;
      var typ = i === 0 ? 'audio/webm; codecs=opus' : 'audio/mp4; codecs=mp4a.40.2';
      if (!adresse) continue;
      var q = document.createElement('source');
      q.src = adresse;
      q.type = typ;
      audio.appendChild(q);
    }
    /* Das Element haengt im Dokument, obwohl `new Audio()` auch losgeloest
       spielt. Zwei Gruende: eine losgeloeste Medienquelle kann die
       Speicherbereinigung mitten im Abspielen einsammeln (gemeldet fuer
       aeltere WebKit-Fassungen), und was im Baum steht, laesst sich
       nachmessen. Zu sehen ist nichts, ein <audio> ohne `controls`
       zeichnet nicht. */
    audio.hidden = true;
    document.body.appendChild(audio);
    return audio;
  }

  /* Ein harter Schnitt auf volle Lautstaerke liest als Fehler, genau wie
     eine Kante zwischen zwei Abschnitten. Geblendet wird in Schritten von
     einem Bild, nicht ueber eine CSS-Regel: `volume` ist keine
     animierbare Eigenschaft. */
  function fahren(ziel, fertig) {
    if (blende) cancelAnimationFrame(blende);
    var von = audio.volume;
    var start = performance.now();
    (function bild(jetzt) {
      var t = Math.min(1, (jetzt - start) / BLENDE);
      audio.volume = Math.max(0, Math.min(1, von + (ziel - von) * t));
      if (t < 1) { blende = requestAnimationFrame(bild); return; }
      blende = null;
      if (fertig) fertig();
    })(start);
  }

  function an() {
    if (laeuft) return;
    laeuft = true;
    anlegen();
    var v = audio.play();
    if (v && v.catch) {
      v.catch(function () {
        /* Ohne Geste laesst der Browser nicht abspielen. Das ist kein
           Fehler, sondern der Normalfall beim zweiten Besuch: der
           Schalter steht aus dem Speicher auf „an", angefasst hat ihn
           aber noch niemand. Wir warten auf die erste Geste. */
        laeuft = false;
      });
    }
    fahren(PEGEL);
  }

  function aus() {
    if (!audio || !laeuft) { laeuft = false; return; }
    laeuft = false;
    fahren(0, function () { audio.pause(); });
  }

  function stand(b) {
    return b.getAttribute('aria-pressed') === 'true';
  }

  /* motion.js hat seinen Zuhoerer frueher angemeldet und laeuft deshalb
     zuerst: wenn wir hier ankommen, steht `aria-pressed` bereits auf dem
     neuen Wert. Und wir sind noch im selben Klick, also innerhalb der
     Geste, die der Browser fuer das Abspielen verlangt. */
  schalter.forEach(function (b) {
    b.addEventListener('click', function () { stand(b) ? an() : aus(); });
  });

  /* Zweiter Besuch: der Schalter steht gespeichert auf „an", eine Geste
     gab es aber noch nicht. Die erste beliebige Geste holt das nach. */
  if (stand(erster)) {
    var wecken = function () {
      if (stand(erster)) an();
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
        window.removeEventListener(ev, wecken);
      });
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      window.addEventListener(ev, wecken, { passive: true });
    });
  }

  /* Wer den Reiter wechselt, will die Musik nicht im Hintergrund
     weiterlaufen haben. Dieselbe Begruendung wie beim Film. */
  document.addEventListener('visibilitychange', function () {
    if (!audio) return;
    if (document.visibilityState === 'hidden') {
      if (laeuft) audio.pause();
    } else if (laeuft && audio.paused) {
      var v = audio.play();
      if (v && v.catch) v.catch(function () {});
    }
  });
})();
