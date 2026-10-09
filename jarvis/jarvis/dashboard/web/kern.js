/* Der Kern: die zentrale Zustandsanzeige.
 *
 * Reagiert auf echte Zustaende, nicht auf Dekoration:
 *   untaetig     ruhiges Atmen
 *   zuhoeren     Ringe folgen dem Mikrofonpegel
 *   verarbeiten  umlaufender Bogen
 *   sprechen     Puls im Sprechrhythmus
 *   fehler       harter, deutlich erkennbarer Warnring
 *
 * Gezeichnet wird mit requestAnimationFrame, aber nur, solange der Tab sichtbar
 * ist -- eine Animation in einem unsichtbaren Tab kostet Akku ohne Nutzen.
 * Bei prefers-reduced-motion wird einmal statisch gezeichnet.
 */

(function () {
  'use strict';

  const FARBEN = {
    'untaetig':     '#4b5563',
    'zuhoeren':     '#3ba3f2',
    'verarbeiten':  '#c99a2e',
    'sprechen':     '#35c08a',
    'fehler':       '#e4584f',
    'ohne sprache': '#4b5563'
  };

  function ReactorCore(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zustand = 'untaetig';
    this.pegel = 0;          // 0..1 vom Mikrofon
    this.geglaettet = 0;     // nachlaufender Pegel, damit es nicht zappelt
    this.spricht = false;
    this.t = 0;
    this.laeuft = false;
    this.ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._skalieren();
    window.addEventListener('resize', this._skalieren.bind(this));
    document.addEventListener('visibilitychange', this._sichtbarkeit.bind(this));
  }

  ReactorCore.prototype._skalieren = function () {
    // Auf Bildschirmen mit hoher Dichte sonst unscharf.
    const dichte = Math.min(window.devicePixelRatio || 1, 2);
    const breite = this.canvas.clientWidth || 340;
    this.canvas.width = breite * dichte;
    this.canvas.height = breite * dichte;
    this.ctx.setTransform(dichte, 0, 0, dichte, 0, 0);
    this.groesse = breite;
    if (this.ruhig) { this.zeichnen(); }
  };

  ReactorCore.prototype._sichtbarkeit = function () {
    if (document.hidden) { this.stoppen(); }
    else if (!this.ruhig) { this.starten(); }
  };

  ReactorCore.prototype.setzen = function (zustand, pegel, spricht) {
    if (zustand && FARBEN[zustand]) { this.zustand = zustand; }
    if (typeof pegel === 'number') {
      // Pegel sind klein (0..0.2); auf einen sichtbaren Bereich spreizen.
      this.pegel = Math.max(0, Math.min(1, pegel * 6));
    }
    this.spricht = !!spricht;
    if (this.ruhig) { this.zeichnen(); }
  };

  ReactorCore.prototype.starten = function () {
    if (this.laeuft || this.ruhig) { this.zeichnen(); return; }
    this.laeuft = true;
    const schritt = () => {
      if (!this.laeuft) { return; }
      this.t += 1 / 60;
      this.geglaettet += (this.pegel - this.geglaettet) * 0.18;
      this.zeichnen();
      requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  };

  ReactorCore.prototype.stoppen = function () { this.laeuft = false; };

  ReactorCore.prototype.zeichnen = function () {
    const ctx = this.ctx;
    const s = this.groesse;
    const mx = s / 2, my = s / 2;
    const farbe = FARBEN[this.zustand] || FARBEN['untaetig'];
    const t = this.t;

    ctx.clearRect(0, 0, s, s);

    const grund = s * 0.26;
    const atem = this.ruhig ? 0 : Math.sin(t * 1.1) * s * 0.008;

    // Aeussere Ringe: im Zuhoeren folgen sie dem Pegel.
    const ringe = 3;
    for (let i = 0; i < ringe; i++) {
      const anteil = i / ringe;
      let radius = grund + s * 0.055 * (i + 1) + atem;
      if (this.zustand === 'zuhoeren') {
        radius += this.geglaettet * s * 0.07 * (1 - anteil);
      }
      ctx.beginPath();
      ctx.arc(mx, my, radius, 0, Math.PI * 2);
      ctx.strokeStyle = this._mitAlpha(farbe, 0.26 - anteil * 0.06);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Verarbeiten: umlaufender Bogen -- sichtbar, dass etwas geschieht.
    if (this.zustand === 'verarbeiten' && !this.ruhig) {
      const radius = grund + s * 0.1;
      ctx.beginPath();
      ctx.arc(mx, my, radius, t * 2.2, t * 2.2 + Math.PI * 0.55);
      ctx.strokeStyle = this._mitAlpha(farbe, 0.85);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Fehler: geschlossener, kraeftiger Warnring.
    if (this.zustand === 'fehler') {
      ctx.beginPath();
      ctx.arc(mx, my, grund + s * 0.1, 0, Math.PI * 2);
      ctx.strokeStyle = this._mitAlpha(farbe, 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Sprechen: Puls im Sprechrhythmus.
    let kern = grund;
    if (this.spricht && !this.ruhig) {
      kern += Math.sin(t * 9) * s * 0.012 + Math.sin(t * 5.3) * s * 0.008;
    } else if (this.zustand === 'zuhoeren') {
      kern += this.geglaettet * s * 0.03;
    }

    // Weicher Hof. Kein Leuchtkreis als Dekoration -- er traegt den Zustand.
    const hof = ctx.createRadialGradient(mx, my, kern * 0.35, mx, my, kern * 1.7);
    hof.addColorStop(0, this._mitAlpha(farbe, 0.38));
    hof.addColorStop(1, this._mitAlpha(farbe, 0));
    ctx.beginPath();
    ctx.arc(mx, my, kern * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = hof;
    ctx.fill();

    // Kernscheibe.
    ctx.beginPath();
    ctx.arc(mx, my, kern, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0f14';
    ctx.fill();
    ctx.strokeStyle = this._mitAlpha(farbe, 0.55);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Innenleben: drei langsam kreisende Segmente.
    for (let i = 0; i < 3; i++) {
      const winkel = t * (this.zustand === 'verarbeiten' ? 1.6 : 0.35)
                   + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(mx, my, kern * 0.62, winkel, winkel + Math.PI * 0.42);
      ctx.strokeStyle = this._mitAlpha(farbe, 0.55);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Mittelpunkt.
    ctx.beginPath();
    ctx.arc(mx, my, kern * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = this._mitAlpha(farbe, 0.92);
    ctx.fill();
  };

  ReactorCore.prototype._mitAlpha = function (hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
  };

  window.ReactorCore = ReactorCore;
})();
