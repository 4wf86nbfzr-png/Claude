/**
 * Baut aus dem statischen Export eine einzelne HTML-Datei zum Weitergeben.
 *
 * Alles wandert hinein: Stylesheets, Skripte, Schriften und das Hero-Video.
 * Damit laesst sich die Startseite ohne Server oeffnen und teilen.
 *
 * Aufruf:
 *   DEMO_EXPORT=1 npm run build
 *   node tools/demo-bundle.mjs
 *
 * Ergebnis: demo/kornkammer-demo.html
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(WURZEL, 'out')
const ZIEL = join(WURZEL, 'demo', 'kornkammer-demo.html')

const lies = (p) => readFileSync(join(OUT, p.replace(/^\//, '')))
const b64 = (buf, typ) => `data:${typ};base64,${buf.toString('base64')}`
const kb = (n) => Math.round(n / 1024).toLocaleString('de-DE')

let html = readFileSync(join(OUT, 'index.html'), 'utf8')
const bilanz = []

/* Hinweis zum Konsolenprotokoll
   Der Router von Next holt beim Ueberfahren eines Links die Daten der
   Zielseite vor. Die gibt es in dieser einen Datei nicht, der Abruf
   scheitert also und wird protokolliert. Sichtbar ist davon nichts: der
   Klick selbst wird weiter unten abgefangen, bevor er navigiert. Ein
   Wechsel von `window.fetch` half nicht, der Aufruf laeuft nicht darueber. */

/* ---------------------------------------------------------------- Tab-Icon */
html = html.replace(/href="\/apple-icon\.png[^"]*"/, () => {
  const icon = lies('/apple-icon.png')
  bilanz.push(['Icon', 'apple-icon.png', icon.length])
  return `href="${b64(icon, 'image/png')}"`
})

/* ---------------------------------------------------------------- Schriften
   Die woff2-Dateien stehen als url(...) im Stylesheet. */
function schriftenEinbetten(css) {
  return css.replace(/url\(([^)]*\.woff2?)\)/g, (treffer, pfad) => {
    const sauber = pfad.replace(/["']/g, '').trim()
    try {
      const buf = lies(sauber)
      bilanz.push(['Schrift', sauber.split('/').pop(), buf.length])
      return `url(${b64(buf, sauber.endsWith('.woff2') ? 'font/woff2' : 'font/woff')})`
    } catch {
      return treffer
    }
  })
}

/* ------------------------------------------------------------- Stylesheets */
html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (treffer, href) => {
    try {
      const css = schriftenEinbetten(lies(href).toString('utf8'))
      bilanz.push(['CSS', href.split('/').pop(), css.length])
      return `<style>${css}</style>`
    } catch {
      return treffer
    }
  },
)
// Vorlade-Hinweise auf Dateien, die es gleich nicht mehr gibt
html = html.replace(/<link[^>]+rel="preload"[^>]*>/g, '')

/* ----------------------------------------------------------------- Skripte
   Reihenfolge bleibt erhalten: Inline-Skripte laufen in Dokumentreihenfolge,
   und genau darauf ist die Chunk-Registrierung von webpack ausgelegt. */
html = html.replace(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g, (treffer, src) => {
  try {
    const js = lies(src).toString('utf8')
    bilanz.push(['JS', src.split('/').pop(), js.length])
    return `<script>${js}\n</script>`
  } catch {
    return treffer
  }
})

/* ------------------------------------------------------------------ Poster */
const poster = lies('/video/hero-poster.webp')
html = html.replace('/video/hero-poster.webp', b64(poster, 'image/webp'))
bilanz.push(['Poster', 'hero-poster.webp', poster.length])

/* ------------------------------------------------- Anfragen, die ins Leere gehen
   Im Buendel gibt es kein /video und kein /images mehr. Die Pfade werden auf
   eine leere Daten-URL gesetzt: der Browser stellt dann gar keine Anfrage,
   und der beschriftete Platzhalter im MediaFrame greift sofort. */

/* Reihenfolge und Zeichenklassen sind hier heikel: im RSC-Payload stehen die
   Pfade JSON-escapt in einem JS-String, also als \"/images/...\". Wer zuerst
   die unescapte Form ersetzt, trifft dort das Anfuehrungszeichen hinter dem
   Backslash, frisst den schliessenden Backslash mit und zerlegt den String —
   die Seite parst dann gar nicht mehr. Deshalb erst die escapte Form, und
   `[^"\\]` statt `[^"]`, damit kein Backslash mitgenommen wird. */
const LEER = '"data:,"'
html = html
  .replace(/\\"\/video\/hero(-2k|-4k)?\.(mp4|webm)\\"/g, '\\"data:,\\"')
  .replace(/(?<!\\)"\/video\/hero(-2k|-4k)?\.(mp4|webm)"/g, LEER)
  .replace(/\\"\/images\/[^"\\]*\\"/g, '\\"data:,\\"')
  .replace(/(?<!\\)"\/images\/[^"\\]*"/g, LEER)
  // Die Schriften stecken schon im Stylesheet. React legt aus dem
  // RSC-Payload aber noch einmal Vorlade-Verweise an, die hier ins Leere
  // zeigen wuerden.
  .replace(/\\"\/_next\/static\/media\/[^"\\]*\\"/g, '\\"data:,\\"')
  .replace(/(?<!\\)"\/_next\/static\/media\/[^"\\]*"/g, LEER)
  // Im RSC-Payload ist mancher Pfad ueber zwei Fragmente verteilt, dort
  // greift kein Muster auf die ganze Zeichenkette. Es reicht aber, den
  // Anfang zu ersetzen: aus dem Rest wird dann eine harmlose Daten-URL.
  .replace(/\/_next\/static\/media\//g, 'data:,')

/* ------------------------------------------------------------- Hero-Video
   Die kleinste Stufe reicht: das Buendel soll sich noch verschicken lassen.
   Als Blob eingehaengt, damit die Daten genau einmal im Dokument stehen.

   WebM statt MP4: die Datei ist kleiner, und VP9 spielt heute jeder Browser
   ab, der fuer so eine Demo in Frage kommt. Wo nicht, bleibt das Poster
   stehen — dieselbe Darstellung wie bei reduzierter Bewegung. */
const video = lies('/video/hero.webm')
bilanz.push(['Video', 'hero.webm', video.length])

const nachtrag = `
<script>
/* Demo-Nachtrag. Steht nicht im Projekt, nur in dieser einzelnen Datei. */
(function () {
  var b64 = "${video.toString('base64')}";

  function alsBlob(daten, typ) {
    var roh = atob(daten)
    var buf = new Uint8Array(roh.length)
    for (var i = 0; i < roh.length; i++) buf[i] = roh.charCodeAt(i)
    return URL.createObjectURL(new Blob([buf], { type: typ }))
  }

  function videoEinhaengen() {
    var v = document.getElementById('hero-video')
    if (!v) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    v.src = alsBlob(b64, 'video/webm')
    v.load()
    var los = v.play()
    if (los && los.catch) los.catch(function () {})
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', videoEinhaengen)
  } else {
    videoEinhaengen()
  }

  /* Unterseiten sind nicht Teil dieser einen Datei. Statt ins Leere zu
     fuehren, sagt die Seite kurz Bescheid. */
  var hinweis = document.createElement('div')
  hinweis.setAttribute('role', 'status')
  hinweis.style.cssText =
    'position:fixed;left:50%;bottom:2rem;transform:translate(-50%,calc(100% + 4rem));z-index:9999;' +
    'background:#efe7d8;color:#141009;padding:.85rem 1.4rem;border-radius:999px;' +
    'font:400 .85rem/1.2 var(--font-body,sans-serif);pointer-events:none;' +
    'transition:transform .45s cubic-bezier(.16,1,.3,1);white-space:nowrap;max-width:92vw'
  hinweis.textContent = 'Nur die Startseite steckt in dieser Demo-Datei.'
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(hinweis)
  })

  var timer
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]')
      if (!a) return
      var href = a.getAttribute('href') || ''
      if (href.charAt(0) !== '/' ) return
      e.preventDefault()
      e.stopPropagation()
      hinweis.style.transform = 'translate(-50%,0)'
      clearTimeout(timer)
      timer = setTimeout(function () {
        hinweis.style.transform = 'translate(-50%,calc(100% + 4rem))'
      }, 2600)
    },
    true,
  )
})()
</script>
`

html = html.replace('</body>', nachtrag + '</body>')

mkdirSync(dirname(ZIEL), { recursive: true })
writeFileSync(ZIEL, html)

console.log('Eingebettet:')
for (const [art, name, groesse] of bilanz) {
  console.log(`  ${art.padEnd(8)} ${name.padEnd(34)} ${kb(groesse).padStart(7)} KB`)
}
console.log(`\n${ZIEL}`)
console.log(`Gesamt: ${kb(statSync(ZIEL).size)} KB`)
