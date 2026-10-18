/* ============================================================
   TEAM KORNKAMMER — Shop
   Warenkorb (localStorage), Schublade, Produktgalerie, Varianten,
   Bestellanfrage. Es wird kein Kauf simuliert: der Warenkorb mündet
   in eine Bestellanfrage per E-Mail (Netlify Forms oder mailto) oder
   in den bestehenden Onlineshop. Siehe README.md, Abschnitt Shop.
   ============================================================ */
(function () {
  'use strict';
  const d = document;
  const $ = (s, c) => (c || d).querySelector(s);
  const $$ = (s, c) => Array.from((c || d).querySelectorAll(s));
  const KEY = 'kornkammer-korb-v1';
  const ROOT = (d.body.dataset.root || './');     // relativer Pfad zur Projektwurzel
  const fmt = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Speicher ---------- */
  const store = {
    read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } },
    write(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} d.dispatchEvent(new CustomEvent('korb:aendert', { detail: items })); },
    add(item) {
      const items = store.read();
      const k = item.id + '|' + item.variant;
      const ex = items.find((i) => i.key === k);
      if (ex) ex.qty = Math.min(item.max || 99, ex.qty + item.qty);
      else items.push(Object.assign({ key: k }, item));
      store.write(items);
      return items;
    },
    setQty(key, qty) {
      let items = store.read();
      const it = items.find((i) => i.key === key);
      if (!it) return;
      it.qty = Math.max(0, Math.min(it.max || 99, qty));
      items = items.filter((i) => i.qty > 0);
      store.write(items);
    },
    remove(key) { store.write(store.read().filter((i) => i.key !== key)); },
    clear() { store.write([]); },
    count() { return store.read().reduce((s, i) => s + i.qty, 0); },
    sum() { return store.read().reduce((s, i) => s + i.qty * i.price, 0); }
  };

  /* ---------- Zähler in der Kopfzeile ---------- */
  function badge(bump) {
    $$('.cartbtn__n').forEach((b) => {
      const n = store.count();
      b.textContent = n;
      b.classList.toggle('is-on', n > 0);
      if (bump) { b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump'); }
    });
  }

  /* ---------- Zeile im Warenkorb ---------- */
  function line(it, compact) {
    const el = d.createElement('div');
    el.className = 'cline';
    el.dataset.key = it.key;
    el.innerHTML =
      '<figure class="media media--tone-paper" data-ph="Produkt">' + (it.img ? '<img src="' + ROOT + it.img + '" alt="">' : '') + '</figure>' +
      '<div><div class="cline__name"><a href="' + ROOT + it.url + '">' + it.name + '</a></div>' +
      '<div class="cline__var">' + it.variant + ' · ' + fmt(it.price) + '</div>' +
      '<div class="cline__ctl"><div class="qty"><button type="button" data-q="-1" aria-label="Weniger">−</button>' +
      '<input type="number" min="1" max="' + (it.max || 99) + '" value="' + it.qty + '" aria-label="Menge">' +
      '<button type="button" data-q="1" aria-label="Mehr">+</button></div>' +
      '<button type="button" class="cline__rm">Entfernen</button></div></div>' +
      '<div class="cline__sum">' + fmt(it.qty * it.price) + '</div>';
    el.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) store.setQty(it.key, it.qty + parseInt(q.dataset.q, 10));
      if (e.target.closest('.cline__rm')) store.remove(it.key);
    });
    $('input', el).addEventListener('change', (e) => store.setQty(it.key, parseInt(e.target.value, 10) || 1));
    watch(el);
    return el;
  }
  function watch(scope) {
    $$('.media > img', scope).forEach((img) => {
      const f = img.parentNode; const miss = () => { f.classList.add('is-missing'); img.remove(); };
      if (img.complete && img.naturalWidth === 0) { miss(); return; }
      img.addEventListener('error', miss, { once: true });
    });
  }

  /* ---------- Schublade ---------- */
  let drawer, scrim;
  function buildDrawer() {
    drawer = d.createElement('aside');
    drawer.className = 'drawer'; drawer.id = 'korb'; drawer.setAttribute('aria-label', 'Warenkorb'); drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML =
      '<div class="drawer__head"><h2>Ihr Korb</h2><button type="button" class="iconbtn" data-close aria-label="Schließen"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="drawer__body"></div>' +
      '<div class="drawer__foot"><div class="totals"><div class="is-total"><span>Zwischensumme</span><b data-sum></b></div><span class="small">Preise inkl. 7 % MwSt., Stand Oktober 2026. Versand oder Abholung klären wir in der Bestätigung.</span></div>' +
      '<a class="btn btn--solid btn--block" href="' + ROOT + 'shop/warenkorb.html">Bestellung anfragen</a>' +
      '<button type="button" class="btn btn--outline btn--block" data-close>Weiter stöbern</button></div>';
    scrim = d.createElement('div'); scrim.className = 'scrim';
    d.body.append(scrim, drawer);
    drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) openDrawer(false); });
    scrim.addEventListener('click', () => openDrawer(false));
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) openDrawer(false); });
    renderDrawer();
  }
  function renderDrawer() {
    if (!drawer) return;
    const body = $('.drawer__body', drawer);
    const items = store.read();
    body.innerHTML = '';
    if (!items.length) {
      body.innerHTML = '<div class="drawer__empty"><p>Noch nichts im Korb.</p><a class="link" href="' + ROOT + 'shop/">Zum Sortiment <svg class="ico" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div>';
    } else items.forEach((it) => body.appendChild(line(it, true)));
    $('[data-sum]', drawer).textContent = fmt(store.sum());
    $$('.drawer__foot .btn--solid', drawer).forEach((b) => b.classList.toggle('is-off', !items.length));
  }
  function openDrawer(open) {
    if (!drawer) buildDrawer();
    drawer.classList.toggle('is-open', open);
    scrim.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    d.body.classList.toggle('is-locked', open);
    if (open) { renderDrawer(); setTimeout(() => $('[data-close]', drawer).focus(), 300); }
  }

  /* ---------- Kurzmeldung + fliegendes Bild ---------- */
  let toast;
  function say(html) {
    if (!toast) { toast = d.createElement('div'); toast.className = 'toast'; toast.setAttribute('role', 'status'); d.body.appendChild(toast); }
    toast.innerHTML = html;
    toast.classList.add('is-on');
    clearTimeout(toast._t); toast._t = setTimeout(() => toast.classList.remove('is-on'), 3200);
  }
  function fly(fromEl, imgSrc) {
    const target = $('.cartbtn');
    if (!target || !fromEl || reduce) return;
    const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    const el = d.createElement('div'); el.className = 'fly';
    if (imgSrc) el.innerHTML = '<img src="' + imgSrc + '" alt="">';
    el.style.left = (a.left + a.width / 2 - 28) + 'px'; el.style.top = (a.top + a.height / 2 - 28) + 'px';
    d.body.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    el.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 80) + 'px) scale(.8)', opacity: 1, offset: .55 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.15)', opacity: .6 }
    ], { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => el.remove();
  }

  /* ---------- In den Korb ---------- */
  function addFrom(btn) {
    const ds = btn.dataset;
    if (!ds.price) return;
    const qtyInput = btn.closest('form, .pdp__info') ? $('.qty input', btn.closest('form, .pdp__info')) : null;
    const item = {
      id: ds.id, name: ds.name, variant: ds.variant || '', price: parseFloat(ds.price),
      img: ds.img || '', url: ds.url || '', max: parseInt(ds.max || '99', 10), qty: qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1
    };
    store.add(item);
    badge(true);
    const hdr = $('.hdr'); if (hdr) hdr.classList.remove('is-hidden');   // Zähler soll sichtbar sein
    fly(btn, ds.img ? ROOT + ds.img : '');
    say('<span><strong>' + item.name + '</strong> liegt im Korb.</span><a href="#korb" data-open-cart>Ansehen</a>');
  }

  /* ---------- Produktseite: Varianten und Menge ---------- */
  function pdp() {
    const info = $('.pdp__info');
    if (!info) return;
    const add = $('[data-add]', info);
    const price = $('[data-price]', info);
    const unit = $('[data-unit]', info);
    const hint = $('[data-variant-hint]', info);
    $$('.variants input', info).forEach((r) => r.addEventListener('change', () => {
      const p = parseFloat(r.dataset.price);
      add.dataset.variant = r.value; add.dataset.price = isNaN(p) ? '' : p; add.dataset.max = r.dataset.max || '99';
      if (price) price.textContent = isNaN(p) ? 'Preis auf Anfrage' : fmt(p);
      if (unit) unit.textContent = r.dataset.unit || '';
      add.disabled = isNaN(p);
      add.textContent = isNaN(p) ? 'Preis anfragen' : 'In den Korb';
      if (hint) hint.hidden = !isNaN(p);
    }));
    const q = $('.qty', info);
    if (q) q.addEventListener('click', (e) => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      const i = $('input', q); i.value = Math.max(1, Math.min(parseInt(i.max || '99', 10), (parseInt(i.value, 10) || 1) + parseInt(b.dataset.q, 10)));
    });
  }

  /* ---------- Galerie: Wischen, Pfeile, Vorschaubilder, Vollbild ---------- */
  function gallery() {
    const gal = $('.gal');
    if (!gal) return;
    const slides = $('.gal__slides', gal);
    const items = $$('.media', slides);
    const thumbs = $$('.gal__thumbs button');
    const dots = $$('.gal__dots i');
    let i = 0;
    const go = (n, smooth) => {
      i = (n + items.length) % items.length;
      slides.scrollTo({ left: items[i].offsetLeft, behavior: smooth === false || reduce ? 'auto' : 'smooth' });
      thumbs.forEach((t, k) => t.classList.toggle('is-on', k === i));
      dots.forEach((t, k) => t.classList.toggle('is-on', k === i));
    };
    $$('.gal__nav button', gal).forEach((b) => b.addEventListener('click', () => go(i + parseInt(b.dataset.dir, 10))));
    thumbs.forEach((t, k) => t.addEventListener('click', () => go(k)));
    let st; slides.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { const k = Math.round(slides.scrollLeft / slides.clientWidth); if (k !== i) { i = k; thumbs.forEach((t, j) => t.classList.toggle('is-on', j === i)); dots.forEach((t, j) => t.classList.toggle('is-on', j === i)); } }, 80); }, { passive: true });
    gal.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); });
    // Vollbild
    const full = $('.gal__full', gal);
    const lb = $('.lightbox');
    if (full && lb && typeof lb.showModal === 'function') {
      full.addEventListener('click', () => {
        const src = items[i];
        const box = $('.lightbox__inner .media', lb);
        box.className = src.className; box.dataset.ph = src.dataset.ph;
        box.innerHTML = src.innerHTML;
        lb.showModal();
      });
      lb.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('.lightbox__close')) lb.close(); });
    }
  }

  /* ---------- Warenkorb-Seite ---------- */
  function cartPage() {
    const list = $('[data-cart-list]');
    if (!list) return;
    const empty = $('[data-cart-empty]');
    const form = $('[data-cart-form]');
    const sum = $$('[data-cart-sum]');
    const render = () => {
      const items = store.read();
      list.innerHTML = '';
      items.forEach((it) => list.appendChild(line(it)));
      sum.forEach((s) => s.textContent = fmt(store.sum()));
      if (empty) empty.hidden = items.length > 0;
      if (form) form.hidden = items.length === 0;
      const ta = $('[name=bestellung]');
      if (ta) ta.value = items.map((it) => it.qty + ' × ' + it.name + ' (' + it.variant + ') à ' + fmt(it.price) + ' = ' + fmt(it.qty * it.price)).join('\n') + '\n\nZwischensumme: ' + fmt(store.sum());
    };
    render();
    d.addEventListener('korb:aendert', render);
    if (form) form.addEventListener('submit', () => { if (form.hasAttribute('data-netlify') || form.dataset.endpunkt) setTimeout(() => { store.clear(); badge(); }, 800); });
    $$('[data-cart-clear]').forEach((b) => b.addEventListener('click', () => { if (confirm('Den Korb wirklich leeren?')) store.clear(); }));
  }

  /* ---------- Start ---------- */
  d.addEventListener('DOMContentLoaded', () => {
    badge();
    d.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) { e.preventDefault(); addFrom(add); return; }
      if (e.target.closest('.cartbtn, [data-open-cart]')) { e.preventDefault(); openDrawer(true); }
    });
    d.addEventListener('korb:aendert', () => { badge(); renderDrawer(); });
    pdp(); gallery(); cartPage();
  });
})();
