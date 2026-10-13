/**
 * Acht Kernabläufe im Browser (Playwright). Läuft gegen API + Web aus test-all.sh.
 * Aufruf aus .pw:  WEB=http://127.0.0.1:13000 API=http://127.0.0.1:18000 API_LOG=../.smoke-api.log node flows.mjs
 * Jeder Ablauf meldet ok/FEHLER; der Prozess endet mit Exit 1, sobald einer fehlschlägt.
 */
import { chromium } from "playwright";
import fs from "node:fs";
const WEB = process.env.WEB ?? "http://127.0.0.1:13000", API = process.env.API ?? "http://127.0.0.1:18000", LOGFILE = process.env.API_LOG;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const results = []; let failed = 0;
async function flow(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  try { await fn(page, ctx); if (errors.length) throw new Error("Seitenfehler: " + errors.join(" | ")); results.push(`ok      ${name}`); }
  catch (e) { failed++; results.push(`FEHLER  ${name}: ${String(e.message).split("\n")[0].slice(0, 200)}`); }
  finally { await ctx.close(); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function linkFromLog(email, marker) {
  for (let i = 0; i < 30; i++) {
    const lines = fs.readFileSync(LOGFILE, "utf8").split("\n").filter((l) => l.includes(email) && l.includes(marker));
    const hit = lines.length ? lines[lines.length - 1].match(new RegExp(marker.replace("?", "\\?") + "([A-Za-z0-9_\\-]+)")) : null;
    if (hit) return hit[1]; await sleep(500);
  }
  throw new Error(`kein Link (${marker}) für ${email} im API-Log`);
}
async function apiJson(path, init = {}, token) {
  const r = await fetch(API + path, { ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const body = await r.json().catch(() => null); return { status: r.status, body };
}
async function registerVerified(page, suffix) {
  const email = `flow-${suffix}-${Date.now()}@beispiel-elektro.de`, pw = "Elbe-Kran-Moewe-33";
  const r = await apiJson("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: pw, full_name: "Flow Test", company: `Flow ${suffix}`, trade: "elektro", accept_terms: true, accept_privacy: true }) });
  if (r.status !== 201) throw new Error("Registrierung " + r.status + " " + JSON.stringify(r.body));
  const token = await linkFromLog(email, "bestaetigen?token=");
  await page.goto(`${WEB}/bestaetigen?token=${token}`); await page.waitForURL(/anmelden/, { timeout: 15000 });
  return { email, pw };
}
async function login(page, email, pw) {
  await page.goto(`${WEB}/anmelden`); await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', pw);
  await page.getByRole("button", { name: "Anmelden" }).click(); await page.waitForURL(/\/app/, { timeout: 15000 });
}

// 1 Startseite: Navigation, Anker, Hero-Knöpfe, Video-Schalter
await flow("Startseite: Navigation, Anker, Video-Schalter", async (page) => {
  await page.goto(WEB + "/"); await page.getByRole("heading", { level: 1 }).waitFor();
  for (const id of ["einblick", "ablauf", "funktionen", "demo", "preise", "faq", "download"]) if (!(await page.$("#" + id))) throw new Error("Anker fehlt: #" + id);
  const btn = page.getByRole("button", { name: /Video anhalten|Video abspielen/ }); await btn.click(); if ((await btn.getAttribute("aria-pressed")) !== "true") throw new Error("Video-Schalter ohne aria-pressed");
  await page.getByRole("link", { name: "Kostenlos testen" }).first().click(); await page.waitForURL(/registrieren/);
});
// 2 Demo: drei Gewerke (die Demo erlaubt 5 Aufrufe je Minute und IP; ein Aufruf kommt aus flow.mjs), Kennzeichnung "regelbasiert"
await flow("Demo: drei Gewerke, Kennzeichnung regelbasiert", async (page) => {
  await page.goto(WEB + "/demo");
  for (const t of ["shk", "elektro", "dach"]) {
    await page.selectOption("select", t); await page.getByRole("button", { name: "Anfrage verarbeiten" }).click();
    await page.getByRole("heading", { name: "Antwortentwurf" }).waitFor({ timeout: 15000 }); await page.getByText("Regelbasiert, keine KI").waitFor();
    await sleep(300);
  }
});
// 3 Registrierung → Bestätigung → Login → Dashboard → Abmelden
await flow("Registrierung, Bestätigung, Login, Abmelden", async (page) => {
  const email = `flow-reg-${Date.now()}@beispiel-elektro.de`, pw = "Elbe-Kran-Moewe-33";
  await page.goto(`${WEB}/registrieren?tarif=business`); await page.getByText("Wunschtarif Business").waitFor();
  await page.fill('input[name="company"]', "Flow Elektro"); await page.fill('input[name="full_name"]', "Kai"); await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', pw);
  await page.check('input[name="terms"]'); await page.check('input[name="privacy"]'); await page.getByRole("button", { name: "Konto anlegen" }).click(); await page.getByText("Fast geschafft").waitFor();
  const token = await linkFromLog(email, "bestaetigen?token="); await page.goto(`${WEB}/bestaetigen?token=${token}`); await page.waitForURL(/anmelden/, { timeout: 15000 });
  await login(page, email, pw); await page.getByText("Übersicht").first().waitFor();
  await page.getByRole("button", { name: "Abmelden" }).first().click(); await page.waitForURL((u) => !/\/app/.test(u.pathname), { timeout: 10000 });
  await page.goto(`${WEB}/app`); await page.waitForURL(/anmelden/, { timeout: 10000 });
});
// 4 Passwort vergessen → Link aus Mail → neues Passwort → Login
await flow("Passwort zurücksetzen", async (page) => {
  const { email } = await registerVerified(page, "reset"); const neu = "Elbe-Kran-Moewe-55-neu";
  await page.goto(`${WEB}/passwort-vergessen`); await page.fill('input[name="email"]', email); await page.getByRole("button").first().click(); await page.getByText("Falls ein Konto existiert").waitFor();
  const token = await linkFromLog(email, "passwort-neu?token=");
  await page.goto(`${WEB}/passwort-neu?token=${token}`); await page.fill('input[name="password"]', neu); await page.getByRole("button").first().click();
  await page.getByText("Passwort geändert").waitFor({ timeout: 15000 }); await login(page, email, neu);
});
// 5 Geschützte Bereiche ohne Login
await flow("Geschützte Bereiche leiten zur Anmeldung", async (page) => {
  for (const p of ["/app", "/app/anfragen", "/app/einstellungen", "/admin"]) { await page.goto(WEB + p); await page.waitForURL(/anmelden/, { timeout: 10000 }); }
  const r = await apiJson("/api/tenant"); if (r.status !== 401) throw new Error("API ohne Token: " + r.status);
});
// 6 Mandantentrennung über die API
await flow("Mandantentrennung: fremde Anfrage nicht lesbar", async (page) => {
  const a = await registerVerified(page, "a"), b = await registerVerified(page, "b");
  const ta = (await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email: a.email, password: a.pw }) })).body.access_token;
  const tb = (await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email: b.email, password: b.pw }) })).body.access_token;
  const inq = await apiJson("/api/inquiries", { method: "POST", body: JSON.stringify({ sender_email: "k@kunde-beispiel.de", subject: "Nur A", body: "Vertraulich für Betrieb A, Musterweg 1, 20095 Hamburg" }) }, ta);
  if (inq.status !== 201) throw new Error("Anfrage anlegen " + inq.status + " " + JSON.stringify(inq.body));
  const id = inq.body.id ?? inq.body.inquiry?.id; const cross = await apiJson(`/api/inquiries/${id}`, {}, tb);
  if (![403, 404].includes(cross.status)) throw new Error("Fremdzugriff lieferte " + cross.status);
  const list = await apiJson("/api/inquiries", {}, tb); const items = Array.isArray(list.body) ? list.body : list.body?.items ?? [];
  if (items.some((i) => i.id === id)) throw new Error("fremde Anfrage in Liste");
});
// 7 Export und Löschung
await flow("Export (JSON, CSV) und Betrieb löschen", async (page) => {
  const u = await registerVerified(page, "exp"); const t = (await apiJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email: u.email, password: u.pw }) })).body.access_token;
  const ex = await apiJson("/api/tenant/export", {}, t); if (ex.status !== 200 || !ex.body?.tenant) throw new Error("Export " + ex.status);
  const csv = await fetch(API + "/api/tenant/export/customers.csv", { headers: { authorization: `Bearer ${t}` } }); if (csv.status !== 200) throw new Error("CSV " + csv.status);
  await login(page, u.email, u.pw); await page.goto(`${WEB}/app/einstellungen`); await page.getByRole("button", { name: /Betrieb löschen|löschen/i }).first().waitFor();
  const me = await apiJson("/api/tenant", {}, t); const slug = me.body?.slug; if (!slug) throw new Error("kein Kurzname: " + JSON.stringify(me.body).slice(0, 120));
  const del = await apiJson("/api/tenant/delete", { method: "POST", body: JSON.stringify({ confirm: slug }) }, t);
  if (![200, 202, 204].includes(del.status)) throw new Error("Löschen " + del.status + " " + JSON.stringify(del.body));
  const after = await apiJson("/api/tenant", {}, t); if (after.status === 200) throw new Error("Betrieb nach Löschung noch lesbar");
});
// 8 Mobil und Tastatur
await flow("Mobil (390 px) ohne Querscrollen, Tastaturfokus", async (page, ctx) => {
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  for (const p of ["/", "/preise", "/demo", "/registrieren", "/anmelden"]) {
    await m.goto(WEB + p, { waitUntil: "networkidle" }); await sleep(400);
    const [sw, iw] = await m.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); if (sw > iw + 1) throw new Error(`${p}: Querscrollen ${sw} > ${iw}`);
  }
  await m.context().close();
  await page.goto(WEB + "/"); await page.keyboard.press("Tab"); const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (!/Zum Inhalt/.test(first ?? "")) throw new Error("erster Tab-Stopp ist nicht der Sprunglink: " + first);
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  const tag = await page.evaluate(() => document.activeElement?.tagName); if (!["A", "BUTTON"].includes(tag ?? "")) throw new Error("Fokus nach 7 Tabs auf " + tag);
  void ctx;
});
await browser.close();
console.log(results.join("\n"));
if (failed) { console.log(`${failed} von ${results.length} Abläufen fehlgeschlagen`); process.exit(1); }
console.log(`Alle ${results.length} Abläufe ok`);
