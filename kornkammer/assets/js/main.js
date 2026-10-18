/* ============================================================
   TEAM KORNKAMMER — Interaktionen
   Kopfzeile, Menü, Einblendungen, Parallax, Scroll-Geschichte,
   horizontale Strecke, Hero-Video, Medien-Fallback, Formulare.
   Keine Abhängigkeiten. Bewegung nur mit Anlass; bei
   prefers-reduced-motion bleibt alles still.
   ============================================================ */
(function () {
  'use strict';

  const d = document;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isReduced = () => reduce.matches;
  const $ = (s, c) => (c || d).querySelector(s);
  const $$ = (s, c) => Array.from((c || d).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Medien: fehlende Datei erkennen ----------
     Liegt unter dem Pfad noch keine Datei, markiert der Rahmen sich als
     vorläufig und zeigt die Beschriftung aus data-ph. Sobald die Datei
     da ist, passiert nichts mehr — kein Platzhalter sieht wie ein Foto aus. */
  function watchMedia() {
    $$('.media > img').forEach((img) => {
      const frame = img.parentNode;
      const miss = () => { frame.classList.add('is-missing'); img.remove(); };
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) { miss(); return; }
      img.addEventListener('error', miss, { once: true });
      img.addEventListener('load', () => frame.classList.remove('is-missing'), { once: true });
    });
  }

  /* ---------- Kopfzeile: fest über dem Hero, wird fest beim Scrollen ---------- */
  function header() {
    const hdr = $('.hdr');
    if (!hdr) return;
    let last = window.scrollY;
    let ticking = false;
    const over = hdr.classList.contains('hdr--over');
    const threshold = over ? Math.min(window.innerHeight * 0.6, 420) : 20;
    const update = () => {
      const y = window.scrollY;
      hdr.classList.toggle('is-solid', y > threshold);
      // Beim Runterscrollen verschwinden, beim Hochscrollen wiederkommen
      if (y > last + 6 && y > 200 && !d.body.classList.contains('is-locked')) hdr.classList.add('is-hidden');
      else if (y < last - 6 || y < 200) hdr.classList.remove('is-hidden');
      last = y;
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
    update();
  }

  /* ---------- Mobiles Menü ---------- */
  function menu() {
    const btn = $('.burger');
    const panel = $('#menu');
    if (!btn || !panel) return;
    const hdr = $('.hdr');
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      d.body.classList.toggle('is-locked', open);
      if (hdr) { hdr.classList.toggle('is-solid', open || window.scrollY > 20); hdr.classList.remove('is-hidden'); }
      if (open) { const first = panel.querySelector('a'); first && setTimeout(() => first.focus(), 350); }
      else btn.focus();
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('is-open')) set(false); });
    window.matchMedia('(min-width:1000px)').addEventListener('change', (e) => { if (e.matches) set(false); });
  }

  /* ---------- Einblendungen beim Scrollen ---------- */
  function reveal() {
    // Überschriften wortweise vorbereiten
    $$('.rv-words').forEach((el) => {
      if (el.dataset.split) return;
      el.dataset.split = '1';
      const walk = (node) => {
        Array.from(node.childNodes).forEach((n) => {
          if (n.nodeType === 3) {
            const frag = d.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(part)); return; }
              const w = d.createElement('span'); w.className = 'w';
              const inner = d.createElement('span'); inner.textContent = part;
              w.appendChild(inner); frag.appendChild(w);
            });
            node.replaceChild(frag, n);
          } else if (n.nodeType === 1 && !n.classList.contains('w')) walk(n);
        });
      };
      walk(el);
    });
    const els = $$('.rv, .rv-words');
    if (!els.length) return;
    if (isReduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const pending = new Set(els);
    const show = (el) => { el.classList.add('is-in'); pending.delete(el); io.unobserve(el); };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) show(en.target); });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    els.forEach((e) => io.observe(e));
    // Sicherheitsnetz: Wer per Anker springt oder sehr schnell scrollt, darf
    // nichts Unsichtbares hinterlassen. Alles, dessen Oberkante schon über
    // dem unteren Sichtrand liegt, wird eingeblendet.
    let ticking = false;
    const sweep = () => {
      const limit = window.innerHeight * 0.92;
      pending.forEach((el) => { if (el.getBoundingClientRect().top < limit) show(el); });
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(sweep); ticking = true; } }, { passive: true });
    window.addEventListener('hashchange', () => setTimeout(sweep, 50));
    setTimeout(sweep, 100);
  }

  /* ---------- Parallax: leichte Gegenbewegung großer Bilder ---------- */
  function parallax() {
    const els = $$('[data-parallax]');
    if (!els.length || isReduced()) return;
    let ticking = false;
    const run = () => {
      const vh = window.innerHeight;
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const f = parseFloat(el.dataset.parallax) || 0.12;
        const center = r.top + r.height / 2 - vh / 2;
        el.style.setProperty('--py', (-center * f).toFixed(1) + 'px');
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(run); ticking = true; } }, { passive: true });
    window.addEventListener('resize', run);
    run();
  }

  /* ---------- Scroll-Geschichte: Kapitel rechts schalten das Bild links ---------- */
  function story() {
    $$('.story').forEach((sec) => {
      const layers = $$('.story__visual .media', sec);
      const chapters = $$('.chapter', sec);
      const counter = $('.story__counter', sec);
      if (!layers.length || !chapters.length) return;
      const show = (i) => {
        layers.forEach((l, k) => l.classList.toggle('is-active', k === i));
        if (counter) {
          const n = $('[data-n]', counter); if (n) n.textContent = String(i + 1).padStart(2, '0');
          counter.style.setProperty('--p', ((i + 1) / chapters.length).toFixed(3));
        }
      };
      show(0);
      if (!('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) show(chapters.indexOf(en.target)); });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      chapters.forEach((c) => io.observe(c));
    });
  }

  /* ---------- Horizontale Strecke ---------- */
  function hscroll() {
    const secs = $$('.hscroll');
    if (!secs.length) return;
    const mq = window.matchMedia('(min-width:900px)');
    let ticking = false;
    const setup = () => {
      secs.forEach((sec) => {
        const track = $('.hscroll__track', sec);
        if (!track) return;
        if (!mq.matches || isReduced()) { sec.style.height = ''; track.style.transform = ''; return; }
        const dist = track.scrollWidth - window.innerWidth + parseFloat(getComputedStyle(track).paddingLeft) * 2;
        sec.dataset.dist = dist;
        sec.style.height = (window.innerHeight + dist * 1.05) + 'px';
      });
      run();
    };
    const run = () => {
      secs.forEach((sec) => {
        const track = $('.hscroll__track', sec);
        const bar = $('.hscroll__bar', sec);
        if (!track || !mq.matches || isReduced()) return;
        const r = sec.getBoundingClientRect();
        const dist = parseFloat(sec.dataset.dist) || 0;
        const total = r.height - window.innerHeight;
        const p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
        track.style.transform = 'translate3d(' + (-p * dist).toFixed(1) + 'px,0,0)';
        if (bar) bar.style.setProperty('--p', p.toFixed(3));
        // Bento-Strom: erste Zelle zieht sich beim Eintritt vom Vollrahmen zusammen
        if (sec.classList.contains('bento')) sec.style.setProperty('--z', clamp(p / 0.12, 0, 1).toFixed(3));
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(run); ticking = true; } }, { passive: true });
    window.addEventListener('resize', setup);
    mq.addEventListener('change', setup);
    setup();
    setTimeout(setup, 400);
  }

  /* ---------- Hero-Video: erst laden, wenn Bewegung erlaubt und Netz ok ---------- */
  function heroVideo() {
    $$('video[data-src]').forEach((v) => {
      const src = v.dataset.src;
      if (!src || isReduced() || location.protocol === 'file:') return;   // ohne Server kein HEAD-Abruf
      const c = navigator.connection;
      if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
      // Nur laden, wenn die Datei da ist — sonst bleibt das Poster/der Rahmen.
      fetch(src, { method: 'HEAD' }).then((r) => {
        if (!r.ok) return;
        v.src = src; v.muted = true; v.playsInline = true; v.loop = true;
        v.addEventListener('canplay', () => { v.parentNode.classList.add('has-video'); v.play().catch(() => {}); }, { once: true });
        v.load();
      }).catch(() => {});
    });
  }

  /* ---------- Hero: leichte Fahrt des Bildes beim Scrollen ---------- */
  function heroDrift() {
    const m = $('.hero__media .media');
    if (!m || isReduced()) return;
    let ticking = false;
    const run = () => {
      const y = window.scrollY;
      if (y < window.innerHeight * 1.2) {
        m.style.transform = 'translate3d(0,' + (y * 0.18).toFixed(1) + 'px,0) scale(' + (1 + y / 9000).toFixed(4) + ')';
      }
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(run); ticking = true; } }, { passive: true });
  }

  /* ---------- Formulare: Netlify > mailto, Honigtopf, weiche Zeitprüfung ---------- */
  function forms() {
    $$('form[data-formular]').forEach((form) => {
      const started = Date.now();
      const msg = $('.form__msg', form) || form.appendChild(Object.assign(d.createElement('p'), { className: 'form__msg' }));
      form.addEventListener('submit', (e) => {
        const hp = form.querySelector('.hp input');
        if (hp && hp.value) { e.preventDefault(); return; }
        if (Date.now() - started < 2500 && !form.dataset.confirmed) {
          e.preventDefault(); form.dataset.confirmed = '1';
          msg.textContent = 'Das ging schnell. Bitte noch einmal auf „Absenden“ klicken, dann geht die Nachricht raus.';
          msg.className = 'form__msg is-err';
          return;
        }
        if (form.dataset.endpunkt) return;        // eigener Endpunkt: normaler POST
        if (form.hasAttribute('data-netlify')) {   // Netlify Forms: per fetch, Rückmeldung in der Seite
          e.preventDefault();
          const btn = form.querySelector('[type=submit]');
          btn && (btn.disabled = true);
          fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)).toString() })
            .then((r) => { if (!r.ok) throw new Error(r.status); form.reset(); msg.textContent = form.dataset.danke || 'Danke, die Nachricht ist angekommen. Wir melden uns.'; msg.className = 'form__msg is-ok'; })
            .catch(() => { msg.textContent = 'Das hat nicht geklappt. Bitte rufen Sie an oder schreiben Sie direkt an ' + (form.dataset.empfaenger || '') + '.'; msg.className = 'form__msg is-err'; })
            .finally(() => { btn && (btn.disabled = false); });
          return;
        }
        // Ohne Endpunkt: E-Mail-Programm mit vorbereitetem Text öffnen
        e.preventDefault();
        const fd = new FormData(form);
        const lines = [];
        fd.forEach((v, k) => { if (k === 'form-name' || k.startsWith('_') || !String(v).trim()) return; lines.push(k + ': ' + v); });
        const to = form.dataset.empfaenger || '';
        const subject = form.dataset.betreff || 'Anfrage über die Website';
        window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
        msg.textContent = 'Ihr E-Mail-Programm öffnet sich mit der vorbereiteten Nachricht. Falls nicht: ' + to;
        msg.className = 'form__msg is-ok';
      });
    });
  }

  /* ---------- Laufband: Inhalt verdoppeln, Tempo aus der Breite ---------- */
  function marquee() {
    $$('.marquee').forEach((m) => {
      const track = $('.marquee__track', m);
      if (!track || isReduced()) return;
      const items = Array.from(track.children);
      // Erst so oft wiederholen, bis ein Satz breiter als der Rahmen ist …
      let setWidth = track.scrollWidth;
      let guard = 0;
      while (setWidth < m.clientWidth && guard++ < 6) { items.forEach((n) => track.appendChild(n.cloneNode(true))); setWidth = track.scrollWidth; }
      // … dann den ganzen Satz einmal kopieren: -50 % ergibt die nahtlose Schleife.
      Array.from(track.children).forEach((n) => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.appendChild(c); });
      const speed = parseFloat(m.dataset.speed) || 40;   // Pixel pro Sekunde
      m.style.setProperty('--dur', (setWidth / speed).toFixed(1) + 's');
      watchMedia();
    });
  }

  /* ---------- Lightbox für Galerien ([data-lightbox]) ---------- */
  function lightbox() {
    const items = $$('[data-lightbox]');
    const lb = $('.lightbox[data-gallery]');
    if (!items.length || !lb || typeof lb.showModal !== 'function') return;
    const fig = $('.lightbox__inner .media', lb);
    const cap = $('.lightbox__cap', lb);
    let i = 0;
    const show = (n) => {
      i = (n + items.length) % items.length;
      const src = items[i].dataset.lightbox;
      fig.innerHTML = '<img src="' + src + '" alt="' + (items[i].dataset.alt || '') + '">';
      if (cap) cap.textContent = (items[i].dataset.alt || '') + ' · ' + (i + 1) + ' / ' + items.length;
    };
    items.forEach((el, k) => el.addEventListener('click', (e) => { e.preventDefault(); show(k); lb.showModal(); }));
    lb.addEventListener('click', (e) => {
      if (e.target.closest('[data-dir]')) show(i + parseInt(e.target.closest('[data-dir]').dataset.dir, 10));
      else if (e.target === lb || e.target.closest('.lightbox__close')) lb.close();
    });
    lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); });
  }

  /* ---------- Sanftes Scrollen mit dem Mausrad ----------
     Nur mit Maus/Trackpad, nicht bei reduzierter Bewegung, nie auf Touch.
     Der native Scroll bleibt erhalten (sticky, Anker, Tastatur funktionieren),
     das Rad wird nur weich nachgezogen. */
  function smoothWheel() {
    if (isReduced() || !window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    let target = window.scrollY, current = target, raf = null;
    const max = () => d.documentElement.scrollHeight - window.innerHeight;
    const loop = () => {
      current += (target - current) * 0.14;
      if (Math.abs(target - current) < 0.6) { current = target; window.scrollTo({ top: current, behavior: 'instant' }); raf = null; return; }
      window.scrollTo({ top: current, behavior: 'instant' });
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.deltaMode !== 0 || d.body.classList.contains('is-locked')) return;
      if (e.target.closest('.hscroll__track, .gal__slides, .drawer, .marquee, textarea, select, [data-no-smooth]')) return;
      e.preventDefault();
      if (!raf) { target = window.scrollY; current = target; }
      target = clamp(target + e.deltaY, 0, max());
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: false });
    window.addEventListener('scroll', () => { if (!raf) { target = window.scrollY; current = target; } }, { passive: true });
  }

  /* ---------- Hero 2: fliegende Bildkarten, Hauptkarte wächst zum Vollbild ---------- */
  function hero2() {
    const sec = $('.hero2'); if (!sec) return;
    const cards = $$('.hcard', sec);
    const main = $('.hcard--main', sec);
    const smooth = (t) => t * t * (3 - 2 * t);
    let ticking = false;
    if (isReduced()) { sec.style.setProperty('--p', '0'); return; }
    const run = () => {
      const r = sec.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      sec.style.setProperty('--p', p.toFixed(3));
      if (p > 0.02) sec.classList.add('is-scrubbing');
      const vw = window.innerWidth, vh = window.innerHeight;
      const grow = smooth(clamp((p - 0.12) / 0.45, 0, 1));
      cards.forEach((c) => {
        const cs = getComputedStyle(c);
        const x0 = parseFloat(cs.getPropertyValue('--x')) / 100 * vw, y0 = parseFloat(cs.getPropertyValue('--y')) / 100 * vh;
        const rot = parseFloat(cs.getPropertyValue('--rot')) || 0;
        if (c === main) {
          const s = Math.max(vw / c.offsetWidth, vh / c.offsetHeight) * 1.02;
          c.style.setProperty('--dx', ((vw / 2 - x0) * grow).toFixed(1) + 'px');
          c.style.setProperty('--dy', ((vh / 2 - y0) * grow).toFixed(1) + 'px');
          c.style.setProperty('--s', (1 + (s - 1) * grow).toFixed(4));
          c.style.setProperty("--full", grow.toFixed(3)); sec.style.setProperty("--full", grow.toFixed(3));
          c.style.transform = `translate(-50%,-50%) translate3d(var(--dx),var(--dy),0) rotate(${(rot * (1 - grow)).toFixed(2)}deg) scale(var(--s))`;
        } else {
          // Nebenkarten gleiten mit dem Scrollen (Parallax) und weichen nach außen, wenn die Hauptkarte wächst
          const depth = parseFloat(c.dataset.depth || '0.3');
          const push = (x0 - vw / 2) * 1.6 * grow, lift = -p * 220 * depth;
          c.style.setProperty('--dx', push.toFixed(1) + 'px');
          c.style.setProperty('--dy', (lift + (y0 - vh / 2) * 0.6 * grow).toFixed(1) + 'px');
          c.style.setProperty('--s', (1 - .35 * grow).toFixed(3));
          c.style.setProperty('--o', (1 - grow).toFixed(3));
        }
      });
      sec.style.setProperty('--p2', smooth(clamp((p - 0.62) / 0.28, 0, 1)).toFixed(3));
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(run); ticking = true; } }, { passive: true });
    window.addEventListener('resize', run);
    run();
  }

  /* ---------- Bildfächer aus der Überschrift ---------- */
  function burst() {
    $$('.burst').forEach((sec) => {
      if (isReduced()) { sec.style.setProperty('--p', '1'); return; }
      let ticking = false;
      const run = () => {
        const r = sec.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        const p = total > 0 ? clamp(-r.top / total, 0, 1) : 1;
        const e = 1 - Math.pow(1 - clamp(p / 0.75, 0, 1), 3);
        sec.style.setProperty('--p', e.toFixed(3));
        ticking = false;
      };
      window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(run); ticking = true; } }, { passive: true });
      run();
    });
  }

  /* ---------- 3D-Coverflow mit Nebelwechsel ---------- */
  function coverflow() {
    $$('.cover').forEach((sec) => {
      const cards = $$('.ccard', sec);
      const cap = { h: $('.cover__caption h3', sec), p: $('.cover__caption p', sec), a: $('.cover__caption a', sec) };
      const dots = $('.cover__dots', sec);
      if (!cards.length) return;
      let i = 0, busy = false;
      if (dots) cards.forEach((_, k) => { const b = d.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Bild ' + (k + 1)); b.addEventListener('click', () => go(k)); dots.appendChild(b); });
      const layout = () => {
        const n = cards.length;
        cards.forEach((c, k) => {
          let off = k - i; if (off > n / 2) off -= n; if (off < -n / 2) off += n;
          c.style.setProperty('--k', off); c.classList.toggle('ccard--hidden', Math.abs(off) > 2);
          c.setAttribute('aria-hidden', String(off !== 0));
        });
        if (dots) $$('button', dots).forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
      };
      const setCaption = () => {
        const c = cards[i];
        if (cap.h) cap.h.textContent = c.dataset.titel || '';
        if (cap.p) cap.p.textContent = c.dataset.text || '';
        if (cap.a) { cap.a.href = c.dataset.link || '#'; cap.a.textContent = c.dataset.cta || 'Mehr'; }
      };
      const go = (k) => {
        if (busy || k === i) return;
        busy = true; i = (k + cards.length) % cards.length;
        if (isReduced()) { layout(); setCaption(); busy = false; return; }
        sec.classList.add('is-switching');
        setTimeout(() => { layout(); setCaption(); }, 520);
        setTimeout(() => { sec.classList.remove('is-switching'); busy = false; }, 1500);
      };
      $$('.cover__arrow--prev', sec).forEach((b) => b.addEventListener('click', () => go(i - 1)));
      $$('.cover__arrow--next', sec).forEach((b) => b.addEventListener('click', () => go(i + 1)));
      cards.forEach((c, k) => c.addEventListener('click', () => { if (k !== i) go(k); }));
      sec.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); });
      let sx = null;
      const stage = $('.cover__stage', sec);
      stage.addEventListener('pointerdown', (e) => { sx = e.clientX; });
      stage.addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1); });
      layout(); setCaption();
    });
  }

  /* ---------- Kleinkram ---------- */
  function misc() {
    $$('[data-jahr]').forEach((el) => { el.textContent = new Date().getFullYear(); });
    // Aktive Seite in der Navigation
    const here = location.pathname.replace(/index\.html$/, '');
    $$('.nav a, .menu__list a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const target = new URL(href, location.href).pathname.replace(/index\.html$/, '');
      if (target === here || (target !== '/' && target.endsWith('/') && here.startsWith(target))) a.setAttribute('aria-current', 'page');
    });
  }

  d.addEventListener('DOMContentLoaded', () => {
    watchMedia(); header(); menu(); reveal(); parallax(); story(); hscroll(); heroVideo(); heroDrift(); forms(); misc();
    marquee(); lightbox(); smoothWheel(); hero2(); burst(); coverflow();
  });
})();
