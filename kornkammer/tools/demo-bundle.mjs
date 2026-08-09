/**
 * Baut aus dem statischen Export eine einzelne HTML-Datei zum Weitergeben.
 *
 * Alles wandert hinein: Stylesheet, Schriften, Skripte, Logo, Poster und das
 * Hero-Video. Damit laesst sich die Startseite ohne Server oeffnen, teilen —
 * und sie sieht auch dann vollstaendig aus, wenn Skripte blockiert sind.
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

/* ================================================================ Waechter
   Die Quellenwahl des Heros setzt `src` auf den Pfad der passenden Stufe.
   Den gibt es in dieser einen Datei nicht mehr, er liegt auf einer leeren
   Daten-URL — die Zuweisung wuerde das eingebettete Video nur loeschen.

   Das Skript einfach zu leeren geht nicht: React vergleicht beim Hydrieren
   auch den Inhalt eines ueber `dangerouslySetInnerHTML` gesetzten Skripts.
   Weicht er ab, wird der Teilbaum neu gebaut und das eingesetzte `src` ist
   weg. Deshalb bleibt das Skript unveraendert, und dieser Waechter laesst
   genau die eine schaedliche Zuweisung ins Leere laufen. Er steht ganz vorn,
   damit er vor allen Buendeln greift. */
html = html.replace(
  '<head>',
  `<head><script>
(function () {
  var d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')
  if (!d || !d.set) return
  Object.defineProperty(HTMLMediaElement.prototype, 'src', {
    configurable: true,
    get: function () {
      return d.get.call(this)
    },
    set: function (wert) {
      if (wert === 'data:,') return
      d.set.call(this, wert)
    },
  })
})()
</script>`,
)

/* =============================================================== Schriften
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

/* ============================================================= Stylesheets */
html = html.replace(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (treffer, href) => {
  try {
    const css = schriftenEinbetten(lies(href).toString('utf8'))
    bilanz.push(['CSS', href.split('/').pop(), css.length])
    return `<style>${css}</style>`
  } catch {
    return treffer
  }
})
// Vorlade-Hinweise auf Dateien, die es gleich nicht mehr gibt
html = html.replace(/<link[^>]+rel="preload"[^>]*>/g, '')

/* ================================================================= Skripte
   Nicht als Inline-Skript einsetzen, sondern die Quelle gegen eine Daten-URL
   tauschen.

   Der Unterschied ist entscheidend: Next liefert seine Buendel mit `async`
   aus, sie laufen also erst nach dem Parsen. Ein Inline-Skript laeuft sofort,
   mitten im Body — React beginnt dann zu hydrieren, bevor der Rest des
   Markups und die restlichen Nutzdaten da sind, und bricht mit einem
   Hydrationsfehler ab. Der Teilbaum wird neu gebaut, und dabei ging unter
   anderem das eingesetzte Video-`src` verloren.

   Mit einer Daten-URL bleiben Ladeart und Reihenfolge exakt wie im Original,
   nur ohne Netzwerk. Kostet ein Drittel mehr Bytes, ist es aber wert. */
html = html.replace(
  /<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>/g,
  (treffer, vor, src, nach) => {
    try {
      const js = lies(src)
      bilanz.push(['JS', src.split('/').pop(), js.length])
      return `<script${vor} src="${b64(js, 'text/javascript')}"${nach}></script>`
    } catch {
      return treffer
    }
  },
)

/* ==================================================================== Logo
   Steht im Markup und im RSC-Payload, deshalb global ersetzen. */
const logo = lies('/logo/logo.webp')
html = html.split('/logo/logo.webp').join(b64(logo, 'image/webp'))
bilanz.push(['Logo', 'logo.webp', logo.length])

/* ================================================================ Tab-Icon */
html = html.replace(/href="\/apple-icon\.png[^"]*"/, () => {
  const icon = lies('/apple-icon.png')
  bilanz.push(['Icon', 'apple-icon.png', icon.length])
  return `href="${b64(icon, 'image/png')}"`
})

/* ================================================================== Poster
   Global ersetzen, nicht nur das erste Vorkommen: der Pfad steht sowohl im
   Markup als auch im RSC-Payload. Wer nur den ersten Treffer nimmt, erwischt
   den Payload und laesst das Attribut am `<video>` stehen — dann bleibt der
   Hero schwarz, sobald das Video nicht laeuft. */
const poster = lies('/video/hero-poster.webp')
html = html.split('/video/hero-poster.webp').join(b64(poster, 'image/webp'))
bilanz.push(['Poster', 'hero-poster.webp', poster.length])

/* ================================================== Pfade, die ins Leere gehen
   Im Buendel gibt es weder /video noch /images. Videopfade werden auf eine
   leere Daten-URL gelegt (der Waechter oben faengt die Zuweisung ab), fuer
   die Fotos tritt ein beschriftetes Platzhalterbild an ihre Stelle.

   Reihenfolge und Zeichenklassen sind heikel: im RSC-Payload stehen die
   Pfade JSON-escapt in einem JS-String. Wer zuerst die unescapte Form
   ersetzt, trifft dort das Anfuehrungszeichen hinter dem Backslash, frisst
   den schliessenden Backslash mit und zerlegt den String — die Seite parst
   dann gar nicht mehr. Deshalb erst die escapte Form, und eine Zeichenklasse
   ohne Backslash. */
const platzhalter = readFileSync(join(WURZEL, 'tools', 'platzhalter.webp'))
const platzUrl = b64(platzhalter, 'image/webp')
bilanz.push(['Platzhalter', 'platzhalter.webp', platzhalter.length])

const LEER = '"data:,"'
const PLATZ = `"${platzUrl}"`
const PLATZ_ESCAPT = `\\"${platzUrl}\\"`

html = html
  .replace(/\\"\/video\/hero(-2k|-4k)?\.(mp4|webm)\\"/g, '\\"data:,\\"')
  .replace(/(?<!\\)"\/video\/hero(-2k|-4k)?\.(mp4|webm)"/g, LEER)
  .replace(/\\"\/images\/[^"\\]*\\"/g, PLATZ_ESCAPT)
  .replace(/(?<!\\)"\/images\/[^"\\]*"/g, PLATZ)
  // Die Schriften stecken schon im Stylesheet. React legt aus dem RSC-Payload
  // aber noch einmal Vorlade-Verweise an, die hier ins Leere zeigen wuerden.
  .replace(/\\"\/_next\/static\/media\/[^"\\]*\\"/g, '\\"data:,\\"')
  .replace(/(?<!\\)"\/_next\/static\/media\/[^"\\]*"/g, LEER)
  // Mancher Pfad ist ueber zwei RSC-Fragmente verteilt, dort greift kein
  // Muster auf die ganze Zeichenkette. Es reicht, den Anfang zu ersetzen.
  .replace(/\/_next\/static\/media\//g, 'data:,')

/* ============================================================== Hero-Video
   Fest als `src` ins Markup, nicht per Skript nachgereicht: sonst laeuft der
   Hero nur dort, wo JavaScript erlaubt ist.

   Die kleinste Stufe reicht, das Buendel soll sich noch verschicken lassen.
   WebM statt MP4, weil kleiner; VP9 spielt jeder Browser ab, der fuer so eine
   Demo in Frage kommt. Wo nicht, bleibt das Poster stehen. */
const video = lies('/video/hero.webm')
bilanz.push(['Video', 'hero.webm', video.length])

const videoVorher = html.length
html = html.replace(
  '<video id="hero-video"',
  `<video id="hero-video" src="${b64(video, 'video/webm')}"`,
)
if (html.length === videoVorher) {
  console.warn('WARNUNG: Das Videoelement wurde nicht gefunden.')
}

/* ================================================================ Nachtrag
   Zum Konsolenprotokoll: der Router von Next holt beim Ueberfahren eines
   Links die Daten der Zielseite vor. Die gibt es in dieser einen Datei nicht,
   der Abruf scheitert also und wird protokolliert. Sichtbar ist davon nichts,
   der Klick wird hier abgefangen, bevor er navigiert. */
const nachtrag = `
<script>
/* Demo-Nachtrag. Steht nicht im Projekt, nur in dieser einzelnen Datei. */
(function () {
  var hinweis = document.createElement('div')
  hinweis.setAttribute('role', 'status')
  hinweis.style.cssText =
    'position:fixed;left:50%;bottom:calc(4rem + 1.25rem);transform:translate(-50%,calc(100% + 14rem));' +
    'z-index:9999;background:#efe7d8;color:#141009;padding:.85rem 1.4rem;border-radius:999px;' +
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
      if (href.charAt(0) !== '/') return
      e.preventDefault()
      e.stopPropagation()
      hinweis.style.transform = 'translate(-50%,0)'
      clearTimeout(timer)
      timer = setTimeout(function () {
        hinweis.style.transform = 'translate(-50%,calc(100% + 14rem))'
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
  console.log(`  ${art.padEnd(12)} ${name.padEnd(32)} ${kb(groesse).padStart(7)} KB`)
}
console.log(`\n${ZIEL}`)
console.log(`Gesamt: ${kb(statSync(ZIEL).size)} KB`)
