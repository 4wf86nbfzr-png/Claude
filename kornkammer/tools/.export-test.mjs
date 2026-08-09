import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1280, height: 900 } })
const fehler = []
p.on('pageerror', (e) => fehler.push(String(e).slice(0, 200)))
p.on('response', (r) => {
  if (r.status() >= 400) fehler.push(`${r.status()} ${r.url()}`)
})

await p.goto('http://localhost:4173/shop.html', { waitUntil: 'networkidle' })
await p.waitForTimeout(1800)

const knopf = p.locator('button:has-text("Auf die Anfrageliste")').first()
await knopf.scrollIntoViewIfNeeded()
await knopf.click()
await p.waitForTimeout(600)
const leiste = await p.locator('button:has-text("Warenkorb")').first().isVisible()
await p.locator('button:has-text("Warenkorb")').first().click()
await p.waitForTimeout(900)
const dialogOffen = await p.locator('[role="dialog"][aria-label="Warenkorb"]').isVisible()
const mail = await p.locator('a:has-text("Bestellung an den Hof")').getAttribute('href')

// Bleibt der Korb ueber einen Seitenwechsel erhalten?
await p.keyboard.press('Escape')
await p.waitForTimeout(400)
await p.goto('http://localhost:4173/hof.html', { waitUntil: 'networkidle' })
await p.waitForTimeout(1800)
const nochDa = await p.locator('button:has-text("Warenkorb")').first().isVisible()

console.log('Leiste erschienen :', leiste)
console.log('Schublade offen   :', dialogOffen)
console.log('Bestellmail       :', mail?.slice(0, 90))
console.log('Korb nach Wechsel :', nochDa)
console.log('Fehler            :', fehler.length ? fehler.slice(0, 6) : 'keine')
await b.close()
