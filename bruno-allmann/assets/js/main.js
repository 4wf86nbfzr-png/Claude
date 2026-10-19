/* BRUNO ALLMANN HEIZUNGSBAU — Interaktionen
   Kopfzeile, mobiles Menü, Hero-Eintritt, Reveals, gestaffelte Karten,
   hochzählende Zahlen, Parallax, Ablauf-Schalter, Kopieren, Formular.
   Kein Framework. Bei prefers-reduced-motion bleibt alles stehen. */
(function () {
  'use strict';
  var d = document;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* ---------- Hero: Buchstaben nummerieren, dann freigeben ---------- */
  var hero = d.querySelector('.hero');
  if (hero) {
    var word = hero.querySelector('.hero__word');
    if (word && !word.querySelector('span')) {
      var text = word.textContent.trim();
      word.textContent = '';
      for (var i = 0; i < text.length; i++) {
        var s = d.createElement('span');
        s.textContent = text[i];
        s.style.setProperty('--i', i);
        word.appendChild(s);
      }
    }
    var img = hero.querySelector('img');
    var ready = function () { hero.classList.add('is-ready'); };
    if (img && !img.complete) { img.addEventListener('load', ready); img.addEventListener('error', ready); setTimeout(ready, 1800); }
    else { requestAnimationFrame(function () { requestAnimationFrame(ready); }); }
  }

  /* ---------- Mobiles Menü ---------- */
  var burger = d.querySelector('.burger');
  var menu = d.getElementById('menu');
  if (burger && menu) {
    var setMenu = function (open) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
      menu.classList.toggle('is-open', open);
      d.body.classList.toggle('locked', open);
    };
    burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  /* ---------- Reveal: einzelne Elemente und gestaffelte Gruppen ---------- */
  var reveals = d.querySelectorAll('.reveal, [data-stagger]');
  d.querySelectorAll('[data-stagger]').forEach(function (group) {
    Array.prototype.forEach.call(group.children, function (child, idx) { child.style.setProperty('--i', idx); });
  });
  if (reveals.length) {
    if (reduce || !hasIO) {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var ro = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); ro.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { ro.observe(el); });
    }
  }

  /* ---------- Zahlen zählen hoch, sobald sie im Bild sind ---------- */
  var counters = d.querySelectorAll('[data-count]');
  var fmt = function (n, sep) { return sep ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(n); };
  var runCount = function (el) {
    var end = parseInt(el.getAttribute('data-count'), 10);
    var from = el.hasAttribute('data-count-from') ? parseInt(el.getAttribute('data-count-from'), 10) : 0;
    var sep = el.hasAttribute('data-count-sep');
    var dur = parseInt(el.getAttribute('data-count-dur') || '1800', 10);
    var t0 = null;
    var step = function (ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 4); /* bremst aus */
      el.textContent = fmt(Math.round(from + (end - from) * e), sep);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(end, sep);
    };
    requestAnimationFrame(step);
  };
  if (counters.length) {
    if (reduce || !hasIO) {
      counters.forEach(function (el) { el.textContent = fmt(parseInt(el.getAttribute('data-count'), 10), el.hasAttribute('data-count-sep')); });
    } else {
      counters.forEach(function (el) {
        var from = el.hasAttribute('data-count-from') ? el.getAttribute('data-count-from') : '0';
        el.textContent = fmt(parseInt(from, 10), el.hasAttribute('data-count-sep'));
      });
      var co = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { runCount(en.target); co.unobserve(en.target); }
        });
      }, { threshold: 0.3 });
      counters.forEach(function (el) { co.observe(el); });
    }
  }

  /* ---------- Parallax: dezent, nur im sichtbaren Bereich ----------
     data-parallax="0.18" verschiebt das Element um 18 % des Weges, den es
     relativ zur Bildschirmmitte zurücklegt. Negativ = läuft dem Scrollen
     hinterher (Hintergründe), positiv = läuft voraus (Text). */
  var px = Array.prototype.slice.call(d.querySelectorAll('[data-parallax]'));
  if (px.length && !reduce) {
    var ticking = false;
    var vh = window.innerHeight;
    var update = function () {
      ticking = false;
      px.forEach(function (el) {
        var host = el.closest('[data-parallax-host]') || el.parentElement;
        var r = host.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) return;
        var center = r.top + r.height / 2 - vh / 2;
        var f = parseFloat(el.getAttribute('data-parallax')) || 0;
        el.style.setProperty('--py', (center * f).toFixed(1) + 'px');
      });
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { vh = window.innerHeight; onScroll(); });
    update();
  }

  /* ---------- Ablauf: Liste schaltet Beschreibung ---------- */
  var steps = d.querySelectorAll('.steps button');
  var desc = d.getElementById('stepDesc');
  if (steps.length && desc) {
    steps.forEach(function (b) {
      var activate = function () {
        steps.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        desc.textContent = b.getAttribute('data-text');
      };
      b.addEventListener('click', activate);
      b.addEventListener('mouseenter', activate);
      b.addEventListener('focus', activate);
    });
  }

  /* ---------- Kopieren ---------- */
  d.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var val = btn.getAttribute('data-copy');
      var done = function () { var t = btn.textContent; btn.textContent = 'Kopiert'; setTimeout(function () { btn.textContent = t; }, 1600); };
      var fallback = function () {
        var target = d.querySelector(btn.getAttribute('data-copy-target'));
        if (target && window.getSelection) {
          var r = d.createRange(); r.selectNodeContents(target);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(done, fallback);
      } else { fallback(); }
    });
  });

  /* ---------- Formular ---------- */
  var form = d.getElementById('anfrage');
  if (form) {
    var started = Date.now();
    var fields = ['name', 'tel', 'email', 'nachricht'];
    var ok = d.getElementById('formOk');
    var validate = function () {
      var good = true;
      fields.forEach(function (id) {
        var el = d.getElementById(id); if (!el) return;
        var wrap = el.closest('.field');
        var bad = el.required && !el.value.trim();
        if (id === 'email' && el.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) bad = true;
        wrap.classList.toggle('is-invalid', bad);
        if (bad) good = false;
      });
      return good;
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var hp = form.querySelector('.hp input');
      if (hp && hp.value) return; /* Bot */
      if (!validate()) { form.querySelector('.is-invalid input, .is-invalid textarea').focus(); return; }
      if (Date.now() - started < 2500 && !form.dataset.confirmed) {
        form.dataset.confirmed = '1';
        ok.hidden = false; ok.textContent = 'Das ging schnell. Bitte prüfen Sie Ihre Angaben kurz und senden Sie erneut.';
        return;
      }
      var get = function (id) { var el = d.getElementById(id); return el ? el.value.trim() : ''; };
      var body = ['Name: ' + get('name'), 'Telefon: ' + get('tel'), 'E-Mail: ' + get('email'), 'Anliegen: ' + get('anliegen'), '', get('nachricht')].join('\n');
      var to = form.getAttribute('data-empfaenger') || '';
      var href = 'mailto:' + to + '?subject=' + encodeURIComponent('Anfrage über die Website: ' + get('anliegen')) + '&body=' + encodeURIComponent(body);
      ok.hidden = false;
      ok.innerHTML = 'Danke. Ihr E-Mail-Programm öffnet sich mit der fertigen Anfrage. Falls nicht: schreiben Sie uns direkt an <strong>' + to + '</strong> oder rufen Sie an unter <strong>040 59 67 35</strong>.';
      try { window.location.href = href; } catch (err) { /* Hinweis steht bereits da */ }
    });
  }
})();
