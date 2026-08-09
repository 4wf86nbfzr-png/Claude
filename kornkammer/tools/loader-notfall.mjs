import { chromium } from 'playwright'

/**
 * Der Loader darf die Seite unter keinen Umstaenden dauerhaft verdecken.
 * Geprueft werden die Faelle, in denen JavaScript nicht oder nicht
 * vollstaendig laeuft.
 */
/**
 * Aufruf:  npm run build && npm start
 *          BASE=http://localhost:3000 node tools/loader-notfall.mjs
 */
const URL_PROD = process.env.BASE || 'http://localhost:3000/'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function pruefe(label, aufbau, { wartezeit = 5000 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(aufbau.ctx || {}) })
  const page = await ctx.newPage()
  if (aufbau.vor) await aufbau.vor(page)
  try {
    await page.goto(URL_PROD, { waitUntil: 'commit' })
  } catch {
    /* egal, es geht um das, was danach zu sehen ist */
  }
  await page.waitForTimeout(wartezeit)

  const z = await page.evaluate(() => {
    const l = document.getElementById('loader')
    const sichtbar =
      !!l &&
      getComputedStyle(l).visibility !== 'hidden' &&
      getComputedStyle(l).display !== 'none' &&
      parseFloat(getComputedStyle(l).opacity) > 0.02
    // Deckt in der Mitte des Bildschirms etwas den Inhalt ab?
    const mitte = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    return {
      loaderSichtbar: sichtbar,
      mitte: mitte ? mitte.tagName + (mitte.id ? '#' + mitte.id : '') : null,
      textLesbar: (document.body.innerText || '').includes('Bio aus dem Revier'),
    }
  })

  const ok = !z.loaderSichtbar && z.textLesbar
  console.log(
    `${ok ? 'ok    ' : 'FEHLER'}  ${label.padEnd(42)} Loader ${z.loaderSichtbar ? 'verdeckt noch' : 'weg'}, Inhalt ${z.textLesbar ? 'lesbar' : 'NICHT lesbar'}`,
  )
  await page.screenshot({
    path: `/tmp/loader-notfall-${label.replace(/\W+/g, '-')}.png`,
  })
  await ctx.close()
  return ok
}

let alleOk = true

alleOk &= await pruefe('Normalfall, alles laeuft', {})

alleOk &= await pruefe('JavaScript abgeschaltet', { ctx: { javaScriptEnabled: false } })

alleOk &= await pruefe('Alle Skript-Buendel blockiert', {
  vor: async (page) => {
    await page.route('**/_next/static/chunks/**', (r) => r.abort())
  },
})

alleOk &= await pruefe('Nur GSAP-Baustein blockiert', {
  vor: async (page) => {
    let ersterTreffer = true
    await page.route('**/_next/static/chunks/**', (r) => {
      // den groessten Anwendungsbaustein wegnehmen
      if (ersterTreffer && /\/\d+-[a-f0-9]+\.js$/.test(r.request().url())) {
        ersterTreffer = false
        return r.abort()
      }
      return r.continue()
    })
  },
})

alleOk &= await pruefe('Fehler bei der Hydration', {
  vor: async (page) => {
    await page.addInitScript(() => {
      // Einen Fehler ausloesen, sobald React beginnt
      const echt = Element.prototype.addEventListener
      let n = 0
      Element.prototype.addEventListener = function (...args) {
        if (++n === 3) throw new Error('Testfehler waehrend der Hydration')
        return echt.apply(this, args)
      }
    })
  },
})

console.log(`\n${alleOk ? 'Alle Szenarien bestanden.' : 'Mindestens ein Szenario fehlgeschlagen.'}`)
await browser.close()
