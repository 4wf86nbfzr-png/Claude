/* BRUNO ALLMANN HEIZUNGSBAU — Interaktionen
   Kopfzeile, mobiles Menü, Hero-Eintritt, Eintritte beim Scrollen,
   Ablauf-Schalter, Kopieren, Formular. Kein Framework. */
(function () {
  'use strict';
  var d = document;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    else { requestAnimationFrame(function(){ requestAnimationFrame(ready); }); }
  }

  /* ---------- Mobiles Menü ---------- */
  var burger = d.querySelector('.burger');
  var menu = d.getElementById('menu');
  if (burger && menu) {
    var setMenu = function (open) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('is-open', open);
      d.body.classList.toggle('locked', open);
    };
    burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  }

  /* ---------- Aktiven Abschnitt in der Navigation markieren ---------- */
  var navLinks = Array.prototype.slice.call(d.querySelectorAll('.nav a[href^="#"]'));
  var sections = navLinks.map(function (a) { return d.querySelector(a.getAttribute('href')); }).filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navLinks.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + en.target.id ? 'true' : 'false'); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- Eintritte beim Scrollen ---------- */
  var reveals = d.querySelectorAll('.reveal');
  if (reveals.length) {
    if (reduce || !('IntersectionObserver' in window)) {
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
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(done, function () { fallback(); });
      } else { fallback(); }
      function fallback () {
        var target = d.querySelector(btn.getAttribute('data-copy-target'));
        if (target && window.getSelection) {
          var r = d.createRange(); r.selectNodeContents(target);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        }
      }
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
      if (form.querySelector('.hp input') && form.querySelector('.hp input').value) return; /* Bot */
      if (!validate()) { form.querySelector('.is-invalid input, .is-invalid textarea').focus(); return; }
      if (Date.now() - started < 2500 && !form.dataset.confirmed) {
        form.dataset.confirmed = '1';
        ok.hidden = false; ok.textContent = 'Das ging schnell. Bitte prüfen Sie Ihre Angaben kurz und senden Sie erneut.';
        return;
      }
      var get = function (id) { var el = d.getElementById(id); return el ? el.value.trim() : ''; };
      var body = [
        'Name: ' + get('name'),
        'Telefon: ' + get('tel'),
        'E-Mail: ' + get('email'),
        'Anliegen: ' + get('anliegen'),
        '',
        get('nachricht')
      ].join('\n');
      var to = form.getAttribute('data-empfaenger') || '';
      var href = 'mailto:' + to + '?subject=' + encodeURIComponent('Anfrage über die Website: ' + get('anliegen')) + '&body=' + encodeURIComponent(body);
      ok.hidden = false;
      ok.innerHTML = 'Danke. Ihr E-Mail-Programm öffnet sich mit der fertigen Anfrage. Falls nicht: schreiben Sie uns direkt an <strong>' + to + '</strong> oder rufen Sie an unter <strong>040 59 67 35</strong>.';
      try { window.location.href = href; } catch (err) { /* Mailto nicht möglich — Hinweis steht bereits da */ }
    });
  }
})();
