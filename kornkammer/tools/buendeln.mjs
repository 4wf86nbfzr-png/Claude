#!/usr/bin/env node
/* ============================================================
   Bündelt eine Seite in EINE HTML-Datei zum Testen ohne Server:
   Stylesheet, Schriften, Skripte und Bilder werden eingebettet.
   Aufruf im Ordner kornkammer/:
     node tools/buendeln.mjs                 → test-vorschau.html (Startseite)
     node tools/buendeln.mjs shop/produkte/rapsoel.html ausgabe.html
   Links zu anderen Seiten bleiben relativ; sie funktionieren, solange
   die Datei im Projektordner liegt. Für die ganze Seite mit allen
   Unterseiten: python3 -m http.server im Ordner starten.
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seite = process.argv[2] || 'index.html';
const ziel = process.argv[3] || 'test-vorschau.html';
const seitenDir = dirname(join(base, seite));
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };

let html = readFileSync(join(base, seite), 'utf8');
let bytes = 0;
const data = (abs) => { const b = readFileSync(abs); bytes += b.length; return `data:${MIME[extname(abs)] || 'application/octet-stream'};base64,${b.toString('base64')}`; };
const lokal = (p) => resolve(seitenDir, p);

/* Stylesheets einbetten, darin referenzierte Schriften als Daten-URL */
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const abs = lokal(href); if (!existsSync(abs)) return m;
  let css = readFileSync(abs, 'utf8');
  css = css.replace(/url\('([^']+)'\)/g, (mm, u) => { const f = resolve(dirname(abs), u); return existsSync(f) ? `url('${data(f)}')` : mm; });
  return `<style>\n/* ${href} */\n${css}\n</style>`;
});
/* Favicon */
html = html.replace(/<link rel="icon" href="([^"]+)"/g, (m, href) => existsSync(lokal(href)) ? `<link rel="icon" href="${data(lokal(href))}"` : m);
/* Preloads entfernen (zeigen auf Dateien, die jetzt eingebettet sind) */
html = html.replace(/\s*<link rel="preload"[^>]*>/g, '');
/* Bilder und Poster */
html = html.replace(/(src|poster)="(assets\/[^"]+|\.\.\/[^"]+)"/g, (m, attr, src) => {
  const abs = lokal(src); return existsSync(abs) && /\.(jpe?g|png|webp|svg)$/i.test(src) ? `${attr}="${data(abs)}"` : m;
});
/* Skripte am Ende einbetten */
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (m, src) => {
  const abs = lokal(src); return existsSync(abs) ? `<script>\n/* ${src} */\n${readFileSync(abs, 'utf8')}\n</script>` : m;
});
/* Hinweis für Tester */
html = html.replace('<body', `<!-- Gebündelte Testfassung, erzeugt mit tools/buendeln.mjs aus ${seite}. Nicht von Hand ändern. -->\n<body`);

writeFileSync(join(base, ziel), html);
console.log(`${ziel}: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB, davon ${(bytes / 1024 / 1024).toFixed(2)} MB eingebettete Dateien`);
