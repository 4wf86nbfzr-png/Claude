/* ============================================================
   Isometrische Reise (Startseite): node tools/build-iso.mjs
   ------------------------------------------------------------
   Zeichnet die Szene „Vom Acker ins Regal“ als SVG und setzt sie in
   index.html zwischen <!-- iso:svg --> und <!-- /iso:svg --> ein.
   Nichts Erfundenes: die sieben Kulturen 2025/2026, der Hof mit
   Mühle, Ölpresse und Senfmühle, der Hofverkauf, das Ruhrgebiet mit
   Bäckereien, Naturkosthandel, EDEKA und Abokiste. Das Windrad steht
   für die Kartoffelfläche „Am Windrad Airwin“ in Dortmund-Barop.
   Scrollsteuerung: iso() in assets/js/main.js (Kamera, Traktor,
   Stationen).
   ============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- Projektion: Ebene (u,v) und Höhe z → Bildschirm ---- */
const C = Math.cos(Math.PI / 6), S = 0.5;
const OX = 760, OY = 150;
const P = (u, v, z = 0) => [+(OX + (u - v) * C).toFixed(1), +(OY + (u + v) * S - z).toFixed(1)];
const pts = (list) => list.map((p) => P(...p).join(',')).join(' ');
const poly = (list, fill, extra = '') => `<polygon points="${pts(list)}" fill="${fill}"${extra}/>`;

/* ---- Farben ---- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const shade = (h, f) => '#' + hex(h).map((c) => Math.max(0, Math.min(255, Math.round(c * f)))).map((c) => c.toString(16).padStart(2, '0')).join('');
const GROUND = '#E7DCC4', GROUND_EDGE = '#D3C4A3', ROAD = '#CBB692', ROAD_EDGE = '#B49E76';
const WALL = '#F6F0E3', ROOF = '#C9743F', LEAF = '#2F7D3F', LEAF2 = '#4DA55B', INK = '#24331F', LABEL = '#4E5A47';

/* ---- Bausteine ---- */
function box(u0, v0, u1, v1, h, c, extra = '') {
  return `<g${extra}>` +
    poly([[u1, v0, 0], [u1, v1, 0], [u1, v1, h], [u1, v0, h]], shade(c, 0.88)) +
    poly([[u0, v1, 0], [u1, v1, 0], [u1, v1, h], [u0, v1, h]], shade(c, 0.74)) +
    poly([[u0, v0, h], [u1, v0, h], [u1, v1, h], [u0, v1, h]], shade(c, 1.06)) +
    '</g>';
}
function house(u0, v0, u1, v1, h, rh, c, rc, extra = '') {
  const vm = (v0 + v1) / 2;
  return `<g${extra}>` +
    poly([[u1, v0, 0], [u1, v1, 0], [u1, v1, h], [u1, v0, h]], shade(c, 0.9)) +
    poly([[u0, v1, 0], [u1, v1, 0], [u1, v1, h], [u0, v1, h]], shade(c, 0.76)) +
    poly([[u1, v0, h], [u1, v1, h], [u1, vm, h + rh]], shade(c, 0.9)) +
    poly([[u0, v0, h], [u1, v0, h], [u1, vm, h + rh], [u0, vm, h + rh]], shade(rc, 1.08)) +
    poly([[u0, v1, h], [u1, v1, h], [u1, vm, h + rh], [u0, vm, h + rh]], shade(rc, 0.82)) +
    '</g>';
}
function field(u0, v0, u1, v1, c, label, cls) {
  let s = `<g class="iso__field ${cls}">` + poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], c);
  for (let v = v0 + 10; v < v1 - 4; v += 12) { const [x1, y1] = P(u0 + 6, v), [x2, y2] = P(u1 - 6, v); s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(0,0,0,.13)" stroke-width="2.5"/>`; }
  const [cx, cy] = P((u0 + u1) / 2, (v0 + v1) / 2);
  s += `<text x="${cx}" y="${cy + 5}" class="iso__label">${label}</text></g>`;
  return s;
}
function tree(u, v, r, h, c = LEAF) {
  const [tx, ty] = P(u, v), [cx, cy] = P(u, v, h);
  return `<g class="iso__tree"><ellipse cx="${tx}" cy="${ty}" rx="${r * 0.9}" ry="${r * 0.45}" fill="rgba(0,0,0,.1)"/><line x1="${tx}" y1="${ty}" x2="${cx}" y2="${cy}" stroke="#6B4E36" stroke-width="5"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/><circle cx="${cx - r * 0.3}" cy="${cy - r * 0.3}" r="${r * 0.45}" fill="${shade(c, 1.3)}" opacity=".6"/></g>`;
}
function label(u, v, z, text, dy = 0) {
  const [x, y] = P(u, v, z);
  return `<text x="${x}" y="${y + dy}" class="iso__label iso__label--big">${text}</text>`;
}
function ring(u0, v0, u1, v1) {
  const [cx, cy] = P((u0 + u1) / 2, (v0 + v1) / 2);
  const rx = ((u1 - u0) + (v1 - v0)) * 0.48, ry = rx * 0.55;
  return `<ellipse class="iso__ring" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
}
function windmill(u, v) {
  const [bx, by] = P(u, v), [tx, ty] = P(u, v, 150);
  const blade = (a) => `<line x1="${tx}" y1="${ty}" x2="${(tx + Math.cos(a) * 44).toFixed(1)}" y2="${(ty + Math.sin(a) * 44).toFixed(1)}" stroke="${WALL}" stroke-width="5" stroke-linecap="round"/>`;
  return `<g class="iso__wind"><line x1="${bx}" y1="${by}" x2="${tx}" y2="${ty}" stroke="${shade(WALL, 0.85)}" stroke-width="6"/><g class="iso__rotor">${blade(-Math.PI / 2)}${blade(Math.PI / 6)}${blade(Math.PI * 5 / 6)}</g><circle cx="${tx}" cy="${ty}" r="5" fill="${WALL}"/></g>`;
}
/* Traktor am Ursprung, Gruppe wird per JS entlang des Weges verschoben */
function tractor() {
  const Q = (u, v, z = 0) => [+((u - v) * C).toFixed(1), +((u + v) * S - z).toFixed(1)];
  const pp = (list, fill) => `<polygon points="${list.map((p) => Q(...p).join(',')).join(' ')}" fill="${fill}"/>`;
  const wheel = (u, v, r) => { const [x, y] = Q(u, v, r); return `<ellipse cx="${x}" cy="${y}" rx="${r * 0.9}" ry="${r}" fill="#262A24"/>`; };
  const b = (u0, v0, u1, v1, z0, h, c) => pp([[u1, v0, z0], [u1, v1, z0], [u1, v1, z0 + h], [u1, v0, z0 + h]], shade(c, 0.88)) + pp([[u0, v1, z0], [u1, v1, z0], [u1, v1, z0 + h], [u0, v1, z0 + h]], shade(c, 0.74)) + pp([[u0, v0, z0 + h], [u1, v0, z0 + h], [u1, v1, z0 + h], [u0, v1, z0 + h]], shade(c, 1.06));
  return `<g class="iso__tractor" aria-hidden="true"><ellipse cx="0" cy="14" rx="30" ry="12" fill="rgba(0,0,0,.14)"/>` +
    wheel(-14, -12, 9) + wheel(-14, 12, 9) + wheel(16, -13, 12) + wheel(16, 13, 12) +
    b(-22, -12, 22, 12, 8, 14, LEAF) + b(-4, -10, 14, 10, 22, 16, '#1B4D2B') + `</g>`;
}

/* ---- Szene ---- */
let s = '';
// Boden
s += poly([[-20, -20], [1300, -20], [1300, 980], [-20, 980]], GROUND);
s += poly([[-20, 980], [1300, 980], [1300, 980, -18], [-20, 980, -18]], GROUND_EDGE);
s += poly([[1300, -20], [1300, 980], [1300, 980, -18], [1300, -20, -18]], shade(GROUND_EDGE, 0.9));

// Felder (Anbau 2025/2026)
s += `<g data-station="felder">`;
s += field(40, 40, 210, 190, '#E8C95A', 'Senf', 'f-senf');
s += field(230, 40, 400, 190, '#C9D18F', 'Hafer', 'f-hafer');
s += field(420, 40, 590, 190, '#C39BB7', 'Rotklee', 'f-rotklee');
s += field(40, 210, 210, 360, '#DEBE70', 'Winterweizen', 'f-weizen');
s += field(230, 210, 400, 360, '#D2A95C', 'Dinkel', 'f-dinkel');
s += field(420, 210, 590, 360, '#7FA86A', 'Kartoffeln', 'f-kartoffeln');
s += field(40, 380, 210, 530, '#93A1D1', 'Blaumohn', 'f-mohn');
s += `</g>`;

// Weg (auch Pfad für den Traktor)
const road = [[300, 560], [860, 560], [860, 760], [1160, 760], [1160, 790]];
const d = road.map((p, i) => (i ? 'L' : 'M') + P(...p).join(' ')).join(' ');
s += `<path d="${d}" fill="none" stroke="${ROAD_EDGE}" stroke-width="40" stroke-linejoin="round" stroke-linecap="round"/>`;
s += `<path d="${d}" fill="none" stroke="${ROAD}" stroke-width="32" stroke-linejoin="round" stroke-linecap="round"/>`;
s += `<path id="isoRoad" d="${d}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="14 18" stroke-linejoin="round"/>`;

// Objekte in Tiefenreihenfolge (hinten → vorn)
const objs = [];
const add = (u, v, svg) => objs.push({ k: u + v, svg });
add(640, 60, windmill(640, 60));
add(520, 430, tree(520, 430, 22, 50));
add(480, 470, tree(480, 470, 18, 44, LEAF2));
add(980, 300, tree(980, 300, 24, 54));
add(560, 640, tree(560, 640, 20, 48, LEAF2));
add(1100, 620, tree(1100, 620, 22, 50));
add(1240, 700, tree(1240, 700, 20, 46, LEAF2));
add(260, 700, tree(260, 700, 26, 56));
add(320, 740, tree(320, 740, 18, 44, LEAF2));
// Hof: Haus Holte mit Mühle, Ölpresse, Senfmühle
add(820, 500, `<g data-station="hof">` + ring(640, 380, 1020, 560) + house(640, 380, 820, 500, 62, 42, WALL, ROOF) + label(600, 540, 30, 'Haus Holte') +
  box(960, 380, 1020, 430, 40, '#E3D8C2') + label(990, 405, 100, 'Mühle') +
  box(960, 450, 1020, 500, 40, '#E3D8C2') + label(990, 475, 100, 'Ölpresse') +
  box(960, 520, 1020, 570, 40, '#E3D8C2') + label(990, 545, 100, 'Senfmühle') + `</g>`);
// Hofverkauf
add(1010, 690, `<g data-station="verkauf">` + ring(880, 600, 1030, 710) + house(900, 620, 1010, 690, 40, 26, WALL, LEAF) + label(930, 660, 136, 'Hofverkauf') + label(930, 660, 116, 'Freitag 8 bis 17 Uhr', 0) + `</g>`);
// Ruhrgebiet: Bäckereien, Naturkost, EDEKA, Abokiste
add(1270, 930, `<g data-station="stadt">` + ring(1120, 790, 1280, 940) +
  box(1140, 800, 1190, 850, 70, '#D8CFBD') + box(1210, 800, 1270, 860, 96, '#D1C7B3') + box(1140, 870, 1200, 920, 56, '#DCD3C1') + box(1220, 880, 1270, 920, 44, '#D8CFBD') +
  label(1205, 860, 170, 'Ruhrgebiet') + label(1205, 860, 148, 'Bäckereien · Naturkost · Abokiste') + `</g>`);
objs.sort((a, b) => a.k - b.k).forEach((o) => { s += o.svg; });
s += tractor();

const svg = `<svg class="iso__svg" viewBox="0 0 1920 1240" aria-hidden="true" focusable="false">${s}</svg>`;

const file = join(base, 'index.html');
const html = readFileSync(file, 'utf8');
const re = /<!-- iso:svg -->[\s\S]*?<!-- \/iso:svg -->/;
if (!re.test(html)) { console.error('Marker <!-- iso:svg --> … <!-- /iso:svg --> fehlt in index.html'); process.exit(1); }
writeFileSync(file, html.replace(re, `<!-- iso:svg -->${svg}<!-- /iso:svg -->`));
console.log(`Isometrische Szene eingesetzt: ${(svg.length / 1024).toFixed(1)} KB SVG.`);
