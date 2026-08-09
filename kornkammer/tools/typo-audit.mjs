import { chromium } from 'playwright'

/**
 * Satzpruefung.
 *
 * Misst fuer jedes Textelement die tatsaechliche Glyphenausdehnung und
 * vergleicht sie mit der Kante jedes Vorfahren, der `overflow: hidden`
 * traegt. Faengt damit abgeschnittene Umlautpunkte, gekappte Unterlaengen,
 * seitlich beschnittene Wortmarken und Elemente, die nie sichtbar werden.
 *
 * Gemessen wird in zwei Durchgaengen: der erste loest die Reveals nur aus,
 * der zweite misst, wenn alles steht. Wer waehrend der Fahrt misst, sieht
 * die Zeile noch unter ihrer Maske und bekommt lauter Fehlalarme.
 *
 * Aufruf:  npm run build && npm start
 *          BASE=http://localhost:3000 node tools/typo-audit.mjs
 */
const BASE = process.env.BASE || 'http://localhost:3000'
/* Voller Durchlauf dauert eine knappe Stunde. Wer nur an einer Seite etwas
   geaendert hat, gibt sie mit SEITEN=/shop,/hof einzeln an. */
const ALLE = [
  '/', '/hof', '/produkte', '/produkte/kartoffeln', '/produkte/getreide', '/produkte/speiseoele',
  '/produkte/nudeln', '/produkte/senf', '/shop', '/bio', '/team', '/hofladen', '/galerie',
  '/kontakt', '/impressum', '/datenschutz', '/gibtsnicht',
]
const SEITEN = process.env.SEITEN ? process.env.SEITEN.split(',') : ALLE
const BREITEN = [
  ['320 sehr schmal', 320, 720],
  ['390 Telefon', 390, 844],
  ['768 Tablet', 768, 1024],
  ['1024 klein', 1024, 768],
  ['1440 Laptop', 1440, 900],
  ['1920 gross', 1920, 1080],
]

/** Einmal pro Seite: jedem Textelement eine stabile Nummer geben. */
const TAGGEN = () => {
  let i = 0
  for (const el of document.querySelectorAll(
    'h1,h2,h3,h4,p,li,a,span,address,figcaption,button,td,th',
  )) {
    const eigen = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim()
    if (!eigen) continue
    if (el.closest('.sr-only') || el.classList.contains('sr-only')) continue
    // Bewusst verborgene Bereiche (geschlossenes Menue, Loader) zaehlen nicht
    if (el.closest('[aria-hidden="true"]') || el.closest('[hidden]')) continue
    el.setAttribute('data-audit', String(i++))
  }
  return i
}

/**
 * Ein Messdurchgang an der aktuellen Scrollposition.
 * Liefert je Element: wie weit die Glyphen ueber eine Maskenkante ragen und
 * ob es gerade sichtbar ist. Ausgewertet wird spaeter das jeweils BESTE
 * Ergebnis ueber alle Positionen — ein Element ist nur dann fehlerhaft,
 * wenn es an keiner Stelle vollstaendig steht.
 */
const MESSEN = () => {
  const c = document.createElement('canvas').getContext('2d')
  const out = {}
  const vh = window.innerHeight

  for (const el of document.querySelectorAll('[data-audit]')) {
    const id = el.getAttribute('data-audit')
    const st = getComputedStyle(el)
    const rect = el.getBoundingClientRect()

    const imBild = rect.bottom > 0 && rect.top < vh && rect.width > 0 && rect.height > 0
    if (!imBild) continue

    // Sichtbarkeit inklusive aller Vorfahren
    let sichtbar = st.visibility !== 'hidden' && st.display !== 'none'
    let deckkraft = parseFloat(st.opacity)
    let p = el.parentElement
    while (p && p !== document.body) {
      const ps = getComputedStyle(p)
      deckkraft *= parseFloat(ps.opacity)
      if (ps.visibility === 'hidden' || ps.display === 'none') sichtbar = false
      p = p.parentElement
    }
    if (deckkraft < 0.05) sichtbar = false

    const eigen = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim()

    c.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`
    const text = st.textTransform === 'uppercase' ? eigen.toUpperCase() : eigen
    const m = c.measureText(text)
    const fs = parseFloat(st.fontSize)
    const lh = st.lineHeight === 'normal' ? fs * 1.2 : parseFloat(st.lineHeight)
    const fbA = m.fontBoundingBoxAscent || fs * 0.8
    const fbD = m.fontBoundingBoxDescent || fs * 0.2

    // Innenabstaende gehoeren nicht zum Text. Wer sie mitrechnet, setzt die
    // Grundlinie zu hoch an und zaehlt zu viele Zeilen — das meldet dann
    // Beschnitt, wo in Wahrheit Polster ist.
    const oben = parseFloat(st.paddingTop) || 0
    const unten = parseFloat(st.paddingBottom) || 0
    const inhalt = Math.max(lh, rect.height - oben - unten)

    const grundlinie = rect.top + oben + (lh - (fbA + fbD)) / 2 + fbA
    const tinteOben = grundlinie - (m.actualBoundingBoxAscent || fbA)
    const zeilen = Math.max(1, Math.round(inhalt / lh))
    const tinteUnten = grundlinie + (zeilen - 1) * lh + (m.actualBoundingBoxDescent || fbD)

    let schnitt = 0
    let woran = ''
    let q = el.parentElement
    while (q && q !== document.body) {
      const qs = getComputedStyle(q)
      if (qs.overflow === 'hidden' || qs.overflowY === 'hidden' || qs.overflowX === 'hidden') {
        const r = q.getBoundingClientRect()
        const ueber = Math.max(r.top - tinteOben, tinteUnten - r.bottom)
        if (ueber > schnitt) {
          schnitt = ueber
          woran = q.tagName.toLowerCase() + '.' + (q.className || '').toString().slice(0, 40)
        }
      }
      q = q.parentElement
    }

    const bisher = out[id]
    const wert = { schnitt, woran, sichtbar, text: eigen.slice(0, 48), tag: el.tagName.toLowerCase() }
    // Bester Zustand gewinnt: erst Sichtbarkeit, dann geringster Beschnitt
    if (!bisher || (wert.sichtbar && !bisher.sichtbar) ||
        (wert.sichtbar === bisher.sichtbar && wert.schnitt < bisher.schnitt)) {
      out[id] = wert
    }
  }
  return out
}

const UEBERLAUF = () => {
  const res = []
  for (const el of document.querySelectorAll('*')) {
    if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue
    const s = getComputedStyle(el)
    if (s.overflowX !== 'hidden' && s.overflowX !== 'clip') continue
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      res.push({
        tag: el.tagName.toLowerCase(),
        klasse: (el.className || '').toString().slice(0, 46),
        scroll: el.scrollWidth,
        client: el.clientWidth,
        text: (el.textContent || '').trim().slice(0, 40),
      })
    }
  }
  return res
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
let gesamt = 0

for (const [label, w, h] of BREITEN) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  const fehlerSeite = []

  for (const pfad of SEITEN) {
    await page.goto(BASE + pfad, { waitUntil: 'load' })
    await page.waitForTimeout(1600)
    await page.evaluate(TAGGEN)

    const beste = {}
    const hoehe = await page.evaluate(() => document.body.scrollHeight)
    const schritt = Math.max(160, Math.floor(h * 0.45))

    // Erster Durchgang: nur ausloesen. Die Reveals laufen ueber eine Sekunde,
    // wer waehrend der Fahrt misst, sieht die Zeile noch unter der Maske.
    for (let y = 0; y <= hoehe; y += schritt) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(120)
    }
    await page.waitForTimeout(2200)

    // Zweiter Durchgang: messen, wenn alles steht.
    for (let y = 0; y <= hoehe; y += schritt) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(420)
      const runde = await page.evaluate(MESSEN)
      for (const [id, v] of Object.entries(runde)) {
        const b = beste[id]
        if (!b || (v.sichtbar && !b.sichtbar) ||
            (v.sichtbar === b.sichtbar && v.schnitt < b.schnitt)) beste[id] = v
      }
    }

    const beschnitten = Object.values(beste).filter((v) => v.schnitt > 0.5)
    const verschwunden = Object.values(beste).filter((v) => !v.sichtbar)
    const ueber = await page.evaluate(UEBERLAUF)

    if (beschnitten.length || verschwunden.length || ueber.length) {
      fehlerSeite.push({ pfad, beschnitten, verschwunden, ueber })
      gesamt += beschnitten.length + verschwunden.length + ueber.length
    }
  }

  if (fehlerSeite.length === 0) {
    console.log(`OK  ${label}`)
  } else {
    console.log(`\n##### ${label}`)
    for (const f of fehlerSeite) {
      console.log(`  ${f.pfad}`)
      for (const b of f.beschnitten)
        console.log(`    BESCHNITTEN ${b.schnitt.toFixed(1)}px <${b.tag}> "${b.text}" durch ${b.woran}`)
      for (const v of f.verschwunden) console.log(`    UNSICHTBAR <${v.tag}> "${v.text}"`)
      for (const u of f.ueber)
        console.log(`    UEBERLAUF ${u.scroll}>${u.client} <${u.tag}.${u.klasse}> "${u.text}"`)
    }
  }
  await ctx.close()
}

console.log(`\nGesamt: ${gesamt} Befund(e)`)
await browser.close()
