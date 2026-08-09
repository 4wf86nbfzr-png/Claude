import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Packt den statischen Export als Zip fuer Netlify.
 *
 * Aufruf ueber `npm run netlify`. Der Bauschritt davor setzt DEMO_EXPORT=1,
 * damit Next nach `out/` exportiert statt einen Node-Server zu erwarten.
 *
 * Warum ein Zip aus dem fertigen Verzeichnis und nicht aus dem Repository:
 * auf app.netlify.com/drop laesst sich das Zip direkt fallen lassen, ohne
 * Build, ohne Node-Version, ohne Plugin. Wer lieber aus dem Repository baut,
 * findet Befehl und Verzeichnis in netlify.toml — beides fuehrt zum selben
 * Ergebnis.
 *
 * Die Kopfzeilen aus next.config.mjs greifen im Export nicht (es liefert kein
 * Node-Server aus). Deshalb legt dieses Skript zusaetzlich `_headers` neben
 * die Dateien: das versteht Netlify auch ohne netlify.toml, also auch beim
 * Drag-and-drop.
 */

const WURZEL = resolve(import.meta.dirname, '..')
const AUS = join(WURZEL, 'out')
const ZIEL = join(WURZEL, 'kornkammer-netlify.zip')

if (!existsSync(AUS)) {
  console.error('`out/` fehlt. Erst bauen: DEMO_EXPORT=1 npm run build')
  process.exit(1)
}

/* Kopfzeilen fuer den Statik-Host. Gleiche Werte wie in netlify.toml —
   doppelt, damit auch der Weg ueber Drag-and-drop sie mitbekommt. */
writeFileSync(
  join(AUS, '_headers'),
  [
    '/video/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/_next/static/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Frame-Options: SAMEORIGIN',
    '',
  ].join('\n'),
)

/* netlify.toml mit ins Paket, damit eine spaetere Anbindung ans Repository
   dieselben Regeln vorfindet. */
cpSync(join(WURZEL, 'netlify.toml'), join(AUS, 'netlify.toml'))

rmSync(ZIEL, { force: true })
execFileSync('zip', ['-r', '-q', '-9', ZIEL, '.'], { cwd: AUS })

/* Kurzbericht: was drin ist und wie schwer. */
function summe(pfad) {
  let bytes = 0
  let dateien = 0
  for (const eintrag of readdirSync(pfad, { withFileTypes: true })) {
    const voll = join(pfad, eintrag.name)
    if (eintrag.isDirectory()) {
      const tiefer = summe(voll)
      bytes += tiefer.bytes
      dateien += tiefer.dateien
    } else {
      bytes += statSync(voll).size
      dateien += 1
    }
  }
  return { bytes, dateien }
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
const { bytes, dateien } = summe(AUS)
const seiten = readdirSync(AUS).filter((n) => n.endsWith('.html')).length

console.log(`Verzeichnis  ${dateien} Dateien, ${mb(bytes)}`)
console.log(`HTML         ${seiten} Seiten auf oberster Ebene`)
console.log(`Zip          ${ZIEL} (${mb(statSync(ZIEL).size)})`)
console.log('')
console.log('Auf app.netlify.com/drop ziehen. Kein Build noetig.')
