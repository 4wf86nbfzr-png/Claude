/* ============================================================
   Bewegung und Ton
   ------------------------------------------------------------
   Läuft nach main.js. Vier Dinge passieren hier:

   Scrollen   Lenis glättet das Rad. Die Seite fließt, statt zu springen.
              Anker, der Knopf nach oben und das gesperrte Menü sind
              angebunden. Während des Vorspanns steht alles still.
   Parallaxe  Bilder in ihren Rahmen bewegen sich etwas langsamer als
              die Seite. Der Wert kommt direkt aus Lenis, kein zweiter
              Scroll-Listener.
   Zeiger     Ein Punkt und ein Ring folgen der Maus. Über Links geht
              der Ring auf, über Bildern wird er zur Lupe.
   Ton        Sehr leise, synthetisch, ohne Dateien: ein Tick auf
              Links, ein weicher Schlag auf Knöpfen, ein Hauch beim
              Schnitt des Vorspanns. Standard ist aus. Wer ihn will,
              schaltet ihn oben rechts an; die Wahl bleibt gespeichert.

   Alles respektiert prefers-reduced-motion und fällt ohne Lenis oder
   ohne Web Audio still auf das Verhalten von main.js zurück.
   ============================================================ */
(function () {
  "use strict";

  var doc = document.documentElement;
  var ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var feinerZeiger = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ----------------------------------------------------------
     Lenis
     ---------------------------------------------------------- */
  var lenis = null;

  if (!ruhig && typeof Lenis === "function") {
    lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.9,
      smoothWheel: true,
      syncTouch: false,
      autoResize: true
    });

    function raf(t) {
      lenis.raf(t);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    /* Vorspann: solange er liegt, wird nicht gescrollt */
    var pre = document.getElementById("preloader");
    if (pre && !pre.classList.contains("done")) {
      lenis.stop();
      var preBeobachter = new MutationObserver(function () {
        if (pre.classList.contains("done")) {
          lenis.start();
          preBeobachter.disconnect();
          ton.hauch();
        }
      });
      preBeobachter.observe(pre, { attributes: true, attributeFilter: ["class"] });
    }

    /* Gesperrter Körper (Menü offen): Lenis pausiert mit */
    var koerperBeobachter = new MutationObserver(function () {
      if (document.body.classList.contains("locked")) lenis.stop();
      else if (!pre || pre.classList.contains("done")) lenis.start();
    });
    koerperBeobachter.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    /* Anker: main.js schaltet für weite Sprünge das native Glätten ab.
       Hier fährt Lenis stattdessen ruhig hin, mit Platz für die Kopfzeile. */
    document.addEventListener(
      "click",
      function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a) return;
        var ziel = a.getAttribute("href");
        if (ziel.length < 2) return;
        var el = null;
        try {
          el = document.querySelector(ziel);
        } catch (err) {
          return;
        }
        if (!el) return;
        e.preventDefault();
        var nav = document.getElementById("nav");
        var abstand = nav ? nav.getBoundingClientRect().height + 16 : 0;
        lenis.scrollTo(el, { offset: -abstand, duration: 1.6 });
      },
      true
    );

    var hoch = document.getElementById("toTop");
    if (hoch) {
      hoch.addEventListener(
        "click",
        function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          lenis.scrollTo(0, { duration: 1.8 });
        },
        true
      );
    }
  }

  /* ----------------------------------------------------------
     Parallaxe und Vorhang
     ---------------------------------------------------------- */
  var lagen = [];
  function lagenSammeln() {
    lagen = [];
    var ziele = document.querySelectorAll(
      ".schaubild picture img, .intro__bild picture img, .tlead__bild picture img, .film__buehne video, .subhero__photo img"
    );
    ziele.forEach(function (img) {
      var rahmen = img.closest("picture") || img.parentElement;
      if (!rahmen) return;
      var staerke = img.closest(".subhero__photo") ? 0.18 : 0.1;
      lagen.push({ img: img, rahmen: rahmen, staerke: staerke });
    });
  }

  function parallaxe() {
    var vh = window.innerHeight;
    for (var i = 0; i < lagen.length; i++) {
      var l = lagen[i];
      var r = l.rahmen.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      var mitte = r.top + r.height / 2 - vh / 2;
      var y = -mitte * l.staerke;
      l.img.style.transform = "translate3d(0," + y.toFixed(1) + "px,0) scale(" + (1 + l.staerke * 1.6).toFixed(3) + ")";
    }
  }

  if (!ruhig) {
    lagenSammeln();
    if (lenis) lenis.on("scroll", parallaxe);
    else window.addEventListener("scroll", parallaxe, { passive: true });
    window.addEventListener("resize", function () {
      lagenSammeln();
      parallaxe();
    });
    parallaxe();
  }

  /* Vorhang: Bildrahmen kommen von oben nach unten ins Bild */
  var vorhaenge = document.querySelectorAll(".schaubild picture, .intro__bild picture, .tlead__bild picture");
  vorhaenge.forEach(function (el) {
    el.setAttribute("data-vorhang", "");
  });
  var schritte = document.querySelectorAll(".schritt");
  if ("IntersectionObserver" in window) {
    /* Beobachtet wird der Rahmen, nicht das Bild: ein Element, das per
       clip-path ganz verdeckt ist, gilt in Chromium als nicht sichtbar
       und wuerde nie ausloesen. */
    var sicht = new IntersectionObserver(
      function (eintraege) {
        eintraege.forEach(function (x) {
          if (x.isIntersecting) {
            x.target.classList.add("in");
            x.target.querySelectorAll("[data-vorhang]").forEach(function (v) {
              v.classList.add("in");
            });
            sicht.unobserve(x.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
    );
    vorhaenge.forEach(function (el) {
      sicht.observe(el.parentElement || el);
    });
    schritte.forEach(function (el) {
      sicht.observe(el);
    });
  } else {
    vorhaenge.forEach(function (el) {
      el.classList.add("in");
    });
  }

  /* ----------------------------------------------------------
     Zeiger
     ---------------------------------------------------------- */
  if (feinerZeiger && !ruhig) {
    var punkt = document.createElement("div");
    punkt.id = "cursor";
    var ring = document.createElement("div");
    ring.id = "cursorRing";
    document.body.appendChild(punkt);
    document.body.appendChild(ring);

    var zx = -100,
      zy = -100,
      rx = -100,
      ry = -100,
      an = false;

    window.addEventListener(
      "pointermove",
      function (e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        zx = e.clientX;
        zy = e.clientY;
        if (!an) {
          an = true;
          document.body.classList.add("zeiger-an");
          rx = zx;
          ry = zy;
        }
        punkt.style.transform = "translate3d(" + zx + "px," + zy + "px,0)";
      },
      { passive: true }
    );
    document.addEventListener("mouseleave", function () {
      an = false;
      document.body.classList.remove("zeiger-an");
    });
    document.addEventListener("pointerdown", function () {
      document.body.classList.add("zeiger-druck");
    });
    document.addEventListener("pointerup", function () {
      document.body.classList.remove("zeiger-druck");
    });

    function ringLauf() {
      rx += (zx - rx) * 0.16;
      ry += (zy - ry) * 0.16;
      ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
      requestAnimationFrame(ringLauf);
    }
    requestAnimationFrame(ringLauf);

    document.addEventListener("pointerover", function (e) {
      var t = e.target;
      if (!t.closest) return;
      var link = t.closest("a, button, [role=button], label, input, select, textarea, summary");
      var bild = !link && t.closest(".schaubild, .intro__bild, .tlead__bild, .film__buehne, .galerie__bild, .scene__frame");
      document.body.classList.toggle("zeiger-link", !!link);
      document.body.classList.toggle("zeiger-bild", !!bild);
    });
  }

  /* ----------------------------------------------------------
     Ton
     ---------------------------------------------------------- */
  var ton = (function () {
    var ctx = null,
      master = null,
      an = false,
      bereit = false,
      speicher = "hst-ton";

    try {
      an = localStorage.getItem(speicher) === "an";
    } catch (e) {}

    function start() {
      if (bereit) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.35;
        master.connect(ctx.destination);
        bereit = true;
      } catch (e) {
        return false;
      }
      return true;
    }

    function rauschen(dauer) {
      var n = Math.floor(ctx.sampleRate * dauer);
      var puffer = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = puffer.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var q = ctx.createBufferSource();
      q.buffer = puffer;
      return q;
    }

    /* Tick: 12 Millisekunden gefiltertes Rauschen, kaum hörbar, aber da */
    function tick() {
      if (!an || !start() || ctx.state !== "running") return;
      var t = ctx.currentTime;
      var q = rauschen(0.02);
      var f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 3200;
      f.Q.value = 6;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
      q.connect(f).connect(g).connect(master);
      q.start(t);
      q.stop(t + 0.03);
    }

    /* Schlag: ein tiefer Sinus, der in 90 Millisekunden absinkt */
    function schlag() {
      if (!an || !start() || ctx.state !== "running") return;
      var t = ctx.currentTime;
      var o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(52, t + 0.09);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.15);
      tick();
    }

    /* Hauch: Rauschen, dessen Filter in 0,6 Sekunden von tief nach hoch fährt */
    function hauch() {
      if (!an || !start() || ctx.state !== "running") return;
      var t = ctx.currentTime;
      var q = rauschen(0.7);
      var f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(200, t);
      f.frequency.exponentialRampToValueAtTime(6000, t + 0.45);
      f.frequency.exponentialRampToValueAtTime(300, t + 0.7);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      q.connect(f).connect(g).connect(master);
      q.start(t);
      q.stop(t + 0.75);
    }

    /* Klang beim Einschalten: zwei kurze Töne, eine Quinte hoch */
    function gruss() {
      if (!start()) return;
      var t = ctx.currentTime;
      [523.25, 783.99].forEach(function (hz, i) {
        var o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = hz;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.09 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.22);
        o.connect(g).connect(master);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 0.25);
      });
    }

    function setzen(neu) {
      an = neu;
      try {
        localStorage.setItem(speicher, an ? "an" : "aus");
      } catch (e) {}
      document.querySelectorAll(".ton").forEach(function (b) {
        b.setAttribute("aria-pressed", an ? "true" : "false");
        b.setAttribute("aria-label", an ? "Ton ausschalten" : "Ton einschalten");
      });
      if (an) {
        start();
        if (ctx && ctx.state === "suspended") ctx.resume();
        gruss();
      }
    }

    /* Der Browser gibt Audio erst nach einer Geste frei */
    function wecken() {
      if (an && start() && ctx.state === "suspended") ctx.resume();
    }
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, wecken, { passive: true });
    });

    return { tick: tick, schlag: schlag, hauch: hauch, setzen: setzen, istAn: function () { return an; } };
  })();

  /* Schalter in der Kopfzeile */
  document.querySelectorAll(".ton").forEach(function (b) {
    b.setAttribute("aria-pressed", ton.istAn() ? "true" : "false");
    b.setAttribute("aria-label", ton.istAn() ? "Ton ausschalten" : "Ton einschalten");
    b.addEventListener("click", function () {
      ton.setzen(!ton.istAn());
    });
  });

  /* Tick auf Links und Menüpunkten, Schlag auf Knöpfen */
  if (feinerZeiger) {
    document.addEventListener("pointerover", function (e) {
      var t = e.target;
      if (!t.closest) return;
      var l = t.closest(".nav__links a, #mobileMenu > a, .megabar__liste a, .btn, .schritt, .versprechen > div, .tcard, .reflogos__reihe li, .socials a, .foot__grid a");
      if (l && l !== letztesZiel) {
        letztesZiel = l;
        ton.tick();
      }
      if (!l) letztesZiel = null;
    });
  }
  var letztesZiel = null;
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest(".btn, .burger, #toTop, .film__knopf, .foot__claim")) ton.schlag();
    else if (t.closest("a")) ton.tick();
  });
})();
