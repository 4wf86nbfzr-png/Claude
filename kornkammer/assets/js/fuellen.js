/* ============================================================
   TEAM KORNKAMMER — Kartoffeln fallen in den Beutel
   ------------------------------------------------------------
   Kleine 2D-Physik auf einer Leinwand HINTER dem Produktbild der
   Lichtbühne: Knollen fallen von oben, stoßen aneinander, rollen aus
   und bleiben im unteren Drittel liegen, wo der freigestellte Beutel
   sie verdeckt. So entsteht der Eindruck des Befüllens, ohne dass
   eine Verpackung verzogen oder ein Modell erfunden wird.

   Läuft nur, wenn die Bühne data-knollen trägt: eine Liste echter
   Freisteller einzelner Kartoffeln (assets/img/produkte/knollen/*.webp,
   siehe MEDIEN.md). Fehlen sie, passiert nichts. Reduzierte Bewegung:
   nichts fällt.
   ============================================================ */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.stage3[data-knollen]').forEach((stage) => {
    const canvas = stage.querySelector('.stage3__knollen');
    const obj = stage.querySelector('.stage3__obj');
    if (!canvas || !obj) return;
    const srcs = stage.dataset.knollen.split(',').map((s) => s.trim()).filter(Boolean);
    const imgs = [];
    let loaded = 0, started = false, raf = null, bodies = [], W = 0, H = 0, floorY = 0, ctx;
    srcs.forEach((s) => { const im = new Image(); im.onload = () => { loaded++; }; im.src = s; imgs.push(im); });

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = stage.clientWidth; H = stage.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Boden = oberes Viertel des Beutels: dort liegen die Knollen, vom Beutel verdeckt
      const r = obj.getBoundingClientRect(), s = stage.getBoundingClientRect();
      floorY = r.top - s.top + r.height * 0.78;
      const cx = r.left - s.left + r.width / 2;
      stage._knollenX = [cx - r.width * 0.22, cx + r.width * 0.22];
    }
    function spawn(n) {
      const [x0, x1] = stage._knollenX;
      for (let i = 0; i < n; i++) {
        const r = 16 + Math.random() * 10;
        bodies.push({ x: x0 + Math.random() * (x1 - x0), y: -40 - i * 70 - Math.random() * 40, px: 0, py: 0, r, a: Math.random() * Math.PI * 2, va: (Math.random() - 0.5) * 0.08, img: imgs[i % imgs.length], rest: 0 });
      }
      bodies.forEach((b) => { if (!b.px) { b.px = b.x - (Math.random() - 0.5) * 2; b.py = b.y; } });
    }
    function step() {
      raf = null;
      const g = 0.55, damp = 0.985;
      const [x0, x1] = stage._knollenX;
      bodies.forEach((b) => {
        const vx = (b.x - b.px) * damp, vy = (b.y - b.py) * damp + g;
        b.px = b.x; b.py = b.y; b.x += vx; b.y += vy; b.a += b.va;
        if (b.y + b.r > floorY) { b.y = floorY - b.r; b.py = b.y + vy * 0.35; b.va *= 0.9; }   // Aufprall mit Dämpfung
        if (b.x - b.r < x0) { b.x = x0 + b.r; b.px = b.x + vx * 0.5; }
        if (b.x + b.r > x1) { b.x = x1 - b.r; b.px = b.x + vx * 0.5; }
      });
      // Kollisionen: Kreise auseinanderschieben, schwerere Knollen bewegen sich weniger
      for (let k = 0; k < 2; k++) for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], c = bodies[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + c.r;
        if (d < min) { const o = (min - d) / 2, nx = dx / d, ny = dy / d, ma = a.r * a.r, mc = c.r * c.r, t = ma + mc;
          a.x -= nx * o * (mc / t) * 2; a.y -= ny * o * (mc / t) * 2; c.x += nx * o * (ma / t) * 2; c.y += ny * o * (ma / t) * 2; }
      }
      ctx.clearRect(0, 0, W, H);
      let moving = false;
      bodies.forEach((b) => {
        if (Math.abs(b.y - b.py) > 0.05 || Math.abs(b.x - b.px) > 0.05) moving = true;
        if (!b.img || !b.img.naturalWidth) return;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
        const h = b.r * 2 * (b.img.naturalHeight / b.img.naturalWidth);
        ctx.drawImage(b.img, -b.r, -h / 2, b.r * 2, h); ctx.restore();
      });
      if (moving) raf = requestAnimationFrame(step);
    }
    function start() {
      if (started || loaded < Math.min(1, srcs.length)) { if (!started) setTimeout(start, 200); return; }
      started = true; size(); spawn(Math.min(9, 5 + srcs.length)); step();
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && stage.classList.contains('is-in')) start(); }), { threshold: 0.3 });
    io.observe(stage);
    stage.addEventListener('animationend', () => { if (!started) start(); });
    window.addEventListener('resize', () => { if (started) { size(); bodies.forEach((b) => { b.y = Math.min(b.y, floorY - b.r); }); if (!raf) raf = requestAnimationFrame(step); } });
  });
})();
