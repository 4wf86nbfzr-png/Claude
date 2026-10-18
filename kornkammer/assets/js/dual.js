/* ============================================================
   Dual-Display: Ansichts-Zustand (dual | oben | unten),
   Kategoriefilter im Shop, Sprunglinks innerhalb der Displays.
   ============================================================ */
(function () {
  'use strict';
  const d = document, body = d.body;
  const KEY = 'kornkammer-dual-modus';
  const mq = window.matchMedia('(min-width:900px)');
  const buttons = Array.from(d.querySelectorAll('[data-mode-set]'));

  function setMode(mode, save) {
    body.dataset.mode = mode;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modeSet === mode)));
    if (save) { try { localStorage.setItem(KEY, mode); } catch (e) {} }
    // Auf dem Handy: zum gewählten Display springen
    if (!mq.matches && mode !== 'dual') { const el = d.querySelector(mode === 'oben' ? '.disp--oben' : '.disp--unten'); el && el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  buttons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.modeSet, true)));
  d.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === '1') setMode('oben', true); if (e.key === '2') setMode('unten', true); if (e.key === '0') setMode('dual', true);
  });
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  setMode(saved && /^(dual|oben|unten)$/.test(saved) ? saved : 'dual', false);

  // Sprunglinks innerhalb eines Displays scrollen den Display-Container, nicht die Seite
  d.querySelectorAll('.disp a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = d.querySelector(a.getAttribute('href')); if (!target) return;
    e.preventDefault();
    const scroller = target.closest('.disp__scroll');
    if (mq.matches && scroller) scroller.scrollTo({ top: target.offsetTop - 70, behavior: 'smooth' });
    else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  // Links zwischen den Displays ([data-go="unten"]) schalten den Fokus-Modus um
  d.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setMode(a.dataset.go, true); }));

  // Kategoriefilter
  const chips = Array.from(d.querySelectorAll('.dchips button'));
  chips.forEach((c) => c.addEventListener('click', () => {
    chips.forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    const kat = c.dataset.kat;
    d.querySelectorAll('.dp').forEach((p) => p.classList.toggle('is-hidden', kat !== 'alle' && p.dataset.kat !== kat));
  }));
})();
