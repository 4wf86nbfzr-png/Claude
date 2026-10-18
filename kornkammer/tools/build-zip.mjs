/* ============================================================
   Netlify-Paket bauen: node tools/build-zip.mjs [ziel.zip]
   ------------------------------------------------------------
   Erzeugt eine ZIP-Datei, die sich bei Netlify per Drag-and-drop
   (app.netlify.com → Sites → „Add new site“ → „Deploy manually“)
   hochladen lässt. Inhalt: der Ordner kornkammer/ als Wurzel, ohne
   Werkzeuge und Testdateien. Die netlify.toml kommt ohne `base`
   mit (im Paket ist der Ordner schon die Wurzel); zusätzlich werden
   _headers und _redirects aus der netlify.toml abgeleitet, weil
   manuelle Deploys diese beiden Dateien sicher auswerten.
   Braucht das Programm `zip`.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] || join(base, '..', 'kornkammer-netlify.zip'));
const tmp = join(tmpdir(), 'kornkammer-zip-build');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp);

// 1. Alles kopieren außer Werkzeuge, Doku, Testfassungen, Build-Reste
const skip = new Set(['tools', 'docs', '.zip-build', 'test-vorschau.html', 'test-dual.html', 'MEDIEN.md', 'README.md', 'node_modules', '.DS_Store']);
// Reserve-Clips (Querausschnitte aus Hochkant) sind nirgends eingebunden
const skipFile = /^assets\/video\/(hof-quer|ernte-drohne-quer-scrub)\./;
cpSync(base, tmp, { recursive: true, filter: (src) => { const rel = src.slice(base.length + 1); return !rel || (!skip.has(rel.split('/')[0]) && !skipFile.test(rel)); } });

// 2. netlify.toml ohne base-Zeile
const toml = readFileSync(join(base, 'netlify.toml'), 'utf8');
writeFileSync(join(tmp, 'netlify.toml'), toml.replace(/^\s*base = "kornkammer"\n/m, ''));

// 3. _headers und _redirects aus der toml ableiten (nur die hier genutzten Formen)
const headers = [];
const redirects = [];
let block = null, cur = null;
for (const raw of toml.split('\n')) {
  const line = raw.trim();
  if (line === '[[headers]]') { block = 'h'; cur = { for: '', values: [] }; headers.push(cur); continue; }
  if (line === '[[redirects]]') { block = 'r'; cur = {}; redirects.push(cur); continue; }
  if (line === '[headers.values]') continue;
  if (line.startsWith('[')) { block = null; continue; }
  if (!block || !line || line.startsWith('#')) continue;
  const m = line.match(/^([A-Za-z-]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const key = m[1], val = m[2].replace(/^"|"$/g, '');
  if (block === 'h') { if (key === 'for') cur.for = val; else cur.values.push([key, val]); }
  else cur[key] = val;
}
writeFileSync(join(tmp, '_headers'), headers.map((h) => h.for + '\n' + h.values.map(([k, v]) => '  ' + k + ': ' + v).join('\n')).join('\n\n') + '\n');
// _redirects trennt mit Leerzeichen; Adressen mit Leerzeichen bleiben der toml vorbehalten
writeFileSync(join(tmp, '_redirects'), redirects.filter((r) => !/\s/.test(r.from)).map((r) => `${r.from}  ${r.to}  ${r.status || 301}`).join('\n') + '\n');

// 4. packen
rmSync(target, { force: true });
execSync(`cd "${tmp}" && zip -q -r -X "${target}" .`);
rmSync(tmp, { recursive: true, force: true });
const size = (readFileSync(target).length / 1048576).toFixed(1);
console.log(`ZIP geschrieben: ${target} (${size} MB, ${headers.length} Header-Blöcke, ${redirects.length} Weiterleitungen)`);
