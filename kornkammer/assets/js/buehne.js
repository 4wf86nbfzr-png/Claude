/* ============================================================
   TEAM KORNKAMMER — Lichtbühne für Produkte (Stufe 1 + 2)
   ------------------------------------------------------------
   Nimmt ein freigestelltes Produktfoto und stellt es in eine dunkle,
   reflektierende Szene: Auftritt aus dem Schatten, Lichtfahrt,
   Partikel, scrollgesteuerter Kameraschwenk, Drehen per Maus/Touch/
   Tastatur. Kein WebGL, keine Abhängigkeit; läuft überall, auch ohne
   Grafikbeschleunigung. Was es NICHT ist: eine echte 360-Grad-Ansicht.
   Ein Foto hat keine Rückseite, deshalb schwenkt die Bühne nur bis
   ±35 Grad. Sobald eine Bildserie oder ein Modell vorliegt, lässt sich
   das pro Produkt über data-serie / data-modell nachrüsten (README).

   Markup: <section class="stage3" data-stage data-partikel="mehl" …>
   erzeugt tools/build-produkte.mjs aus data/produkte.json.
   ============================================================ */
(function () {
  'use strict';
  const d = document;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover:hover) and (pointer:fine)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* Partikel-Voreinstellungen: Farbe, Größe, Bewegung, Menge */
  const PARTIKEL = {
    mehl:  { rgb: '246,238,224', r: [0.6, 2.2], vy: [-0.08, -0.02], vx: [-0.05, 0.05], a: [0.15, 0.5], blur: 0,  dichte: 1.0 },
    korn:  { rgb: '226,186,104', r: [0.8, 2.4], vy: [0.03, 0.12],   vx: [-0.04, 0.04], a: [0.2, 0.6],  blur: 0,  dichte: 0.8 },
    gold:  { rgb: '240,192,96',  r: [2, 7],     vy: [-0.05, 0.02],  vx: [-0.03, 0.03], a: [0.06, 0.22], blur: 3, dichte: 0.35 },
    erde:  { rgb: '168,124,80',  r: [0.7, 2],   vy: [-0.06, 0.02],  vx: [-0.06, 0.06], a: [0.12, 0.4], blur: 0,  dichte: 0.7 },
    hell:  { rgb: '255,250,240', r: [0.5, 1.8], vy: [-0.06, -0.01], vx: [-0.04, 0.04], a: [0.1, 0.4],  blur: 0,  dichte: 0.6 }
  };

  class Buehne {
    constructor(el) {
      this.el = el;
      this.obj = el.querySelector('.stage3__obj');
      this.canvas = el.querySelector('.stage3__fx');
      this.preset = PARTIKEL[el.dataset.partikel] || PARTIKEL.hell;
      this.rot = { y: 0, x: 0 };          // aktuelle Drehung
      this.user = { y: 0, x: 0, t: 0 };   // Drehung durch Nutzer, t = Stärke
      this.scrollTilt = 0;
      this.visible = false;
      this.started = false;
      this.dragging = false;
      this.raf = null;
      this.particles = [];
      this.t0 = performance.now();
      this.init();
    }

    init() {
      const el = this.el;
      if (reduce.matches) { el.classList.add('is-static', 'is-in'); this.bindDrag(); return; }
      // Auftritt erst, wenn die Bühne sichtbar wird; Partikel nur solange sie sichtbar ist
      const video = el.querySelector('.stage3__video');
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        this.visible = e.isIntersecting;
        if (e.isIntersecting && !this.started) { this.started = true; el.classList.add('is-in'); }
        if (this.visible) this.loop(); else this.stop();
        // Produktfilm nur abspielen, solange die Bühne im Bild ist
        if (video) { if (this.visible) video.play().catch(() => {}); else video.pause(); }
      }), { threshold: 0.15 });
      io.observe(el);
      this.resize();
      window.addEventListener('resize', () => this.resize(), { passive: true });
      window.addEventListener('scroll', () => this.onScroll(), { passive: true });
      this.onScroll();
      this.bindDrag();
    }

    resize() {
      const c = this.canvas; if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, fine.matches ? 1.5 : 1.25);
      const w = this.el.clientWidth, h = this.el.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      this.ctx = c.getContext('2d'); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.h = h;
      const n = Math.round(clamp((w * h) / 14000, 24, 110) * this.preset.dichte);
      const p = this.preset, rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
      this.particles = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: rnd(p.r), vx: rnd(p.vx), vy: rnd(p.vy), a: rnd(p.a), ph: Math.random() * Math.PI * 2
      }));
    }

    onScroll() {
      // Kameraschwenk: je nachdem, wo die Bühne im Fenster steht, dreht das Produkt leicht mit
      const r = this.el.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);   // -1 … 1
      this.scrollTilt = clamp(-center, -1, 1) * 14;
      this.el.style.setProperty('--sweep', (clamp(0.5 - center * 0.5, 0, 1) * 100).toFixed(1) + '%');
    }

    bindDrag() {
      const obj = this.obj; if (!obj) return;
      let sx = 0, sy = 0, by = 0, bx = 0;
      obj.addEventListener('dragstart', (e) => e.preventDefault());   // kein nativer Bild-Drag
      obj.addEventListener('pointerdown', (e) => {
        if (e.button && e.button !== 0) return;
        e.preventDefault();
        this.dragging = true; sx = e.clientX; sy = e.clientY; by = this.user.y; bx = this.user.x;
        obj.setPointerCapture(e.pointerId); obj.classList.add('is-drag');
        if (!this.raf) this.loop();
      });
      obj.addEventListener('pointermove', (e) => {
        if (!this.dragging) return;
        this.user.y = clamp(by + (e.clientX - sx) * 0.25, -35, 35);
        this.user.x = clamp(bx - (e.clientY - sy) * 0.12, -12, 12);
        this.user.t = 1;
      });
      const end = () => { this.dragging = false; obj.classList.remove('is-drag'); };
      obj.addEventListener('pointerup', end); obj.addEventListener('pointercancel', end);
      obj.addEventListener('keydown', (e) => {
        const step = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] }[e.key];
        if (!step) return;
        e.preventDefault();
        this.user.y = clamp(this.user.y + step[0], -35, 35); this.user.x = clamp(this.user.x + step[1], -12, 12); this.user.t = 1;
        if (!this.raf) this.loop();
      });
      obj.addEventListener('dblclick', () => { this.user.y = 0; this.user.x = 0; });
    }

    loop() {
      if (this.raf) return;
      const step = (now) => {
        this.raf = null;
        const t = (now - this.t0) / 1000;
        // Ruhige Eigenbewegung, Nutzerdrehung klingt langsam ab, Scroll-Schwenk kommt dazu
        if (!this.dragging) this.user.t = Math.max(0, this.user.t - 0.004);
        const idleY = Math.sin(t * 0.35) * 6, idleX = Math.cos(t * 0.27) * 1.5;
        const targetY = this.user.y * this.user.t + (idleY + this.scrollTilt) * (1 - this.user.t * 0.6);
        const targetX = this.user.x * this.user.t + idleX * (1 - this.user.t);
        this.rot.y = lerp(this.rot.y, targetY, this.dragging ? 0.35 : 0.06);
        this.rot.x = lerp(this.rot.x, targetX, this.dragging ? 0.35 : 0.06);
        this.el.style.setProperty('--ry', this.rot.y.toFixed(2) + 'deg');
        this.el.style.setProperty('--rx', this.rot.x.toFixed(2) + 'deg');
        this.el.style.setProperty('--shade', (0.5 - this.rot.y / 70).toFixed(3));
        this.drawParticles(t);
        if (this.visible || this.dragging || this.user.t > 0) this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }
    stop() { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; } }

    drawParticles(t) {
      const ctx = this.ctx; if (!ctx) return;
      const p = this.preset, w = this.w, h = this.h;
      ctx.clearRect(0, 0, w, h);
      if (p.blur) ctx.filter = 'blur(' + p.blur + 'px)';
      for (const q of this.particles) {
        q.x += q.vx + Math.sin(t * 0.6 + q.ph) * 0.05; q.y += q.vy;
        if (q.y < -10) { q.y = h + 10; q.x = Math.random() * w; }
        if (q.y > h + 10) { q.y = -10; q.x = Math.random() * w; }
        if (q.x < -10) q.x = w + 10; if (q.x > w + 10) q.x = -10;
        const a = q.a * (0.6 + 0.4 * Math.sin(t * 1.3 + q.ph));
        ctx.fillStyle = 'rgba(' + p.rgb + ',' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
      }
      if (p.blur) ctx.filter = 'none';
    }
  }

  /* Produktkarten: leichte Neigung zum Zeiger (nur mit Maus) */
  function cardTilt() {
    if (!fine.matches || reduce.matches) return;
    d.querySelectorAll('.pcard .media').forEach((m) => {
      m.addEventListener('pointermove', (e) => {
        const r = m.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        m.style.setProperty('--tx', (x * 8).toFixed(2) + 'deg'); m.style.setProperty('--ty', (-y * 8).toFixed(2) + 'deg');
        m.style.setProperty('--gx', ((x + 0.5) * 100).toFixed(1) + '%'); m.style.setProperty('--gy', ((y + 0.5) * 100).toFixed(1) + '%');
      });
      m.addEventListener('pointerleave', () => { m.style.setProperty('--tx', '0deg'); m.style.setProperty('--ty', '0deg'); });
    });
  }

  d.addEventListener('DOMContentLoaded', () => {
    d.querySelectorAll('[data-stage]').forEach((el) => new Buehne(el));
    cardTilt();
  });
})();
