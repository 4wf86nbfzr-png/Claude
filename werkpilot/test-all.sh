#!/usr/bin/env bash
# ==============================================================================
# WerkPilot AI – vollständiger Testlauf
#
#   ./test-all.sh            alles: Backend (Lint, Tests, Migration, Audit),
#                            Frontend (Lint, Build), Smoke-Test (API + Web starten,
#                            Seiten abrufen, API-Kundenreise), Browser-Durchlauf
#   ./test-all.sh --quick    ohne Smoke- und Browser-Test
#   ./test-all.sh --no-browser   alles außer Playwright
#
# Voraussetzungen: Python ≥3.12, Node 22, laufendes PostgreSQL (lokal 5432 oder
# TEST_DATABASE_URL gesetzt). Browser-Teil braucht `npx playwright` oder eine
# vorhandene Chromium-Installation (PLAYWRIGHT_CHROMIUM=/pfad/zu/chromium).
# Exit-Code 0 = alles bestanden. Jeder Abschnitt meldet OK/FEHLER.
# ==============================================================================
set -u
cd "$(dirname "$0")"
ROOT="$(pwd)"
QUICK=0; BROWSER=1
for a in "$@"; do case "$a" in --quick) QUICK=1; BROWSER=0;; --no-browser) BROWSER=0;; esac; done

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[0;33m'; NC='\033[0m'
FAILS=(); PASSES=()
RESULTS="$(mktemp)"; SECTION=""; T0=$(date +%s); STARTED_AT="$(date '+%d.%m.%Y %H:%M')"
step() { SECTION="$1"; printf "\n${YEL}== %s ==${NC}\n" "$1"; }
ok()   { PASSES+=("$1"); printf "${GRN}OK${NC}  %s\n" "$1"; printf 'OK\t%s\t%s\t%s\n' "$SECTION" "$1" "$(( $(date +%s) - T0 ))" >>"$RESULTS"; }
bad()  { FAILS+=("$1"); printf "${RED}FEHLER${NC}  %s\n" "$1"; printf 'FEHLER\t%s\t%s\t%s\n' "$SECTION" "$1" "$(( $(date +%s) - T0 ))" >>"$RESULTS"; }
run()  { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }

export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql+asyncpg://werkpilot:werkpilot@localhost:5432/werkpilot_test}"
LOG="$ROOT/.test-all.log"; : > "$LOG"

# ------------------------------------------------------------------ Backend
step "Backend: Umgebung"
cd "$ROOT/backend"
PY=".venv/bin/python"
if [ ! -x "$PY" ]; then
  python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]" >>"$LOG" 2>&1 || { bad "Backend-Abhängigkeiten installieren"; }
fi
run "Backend: Abhängigkeiten importierbar" $PY -c "import fastapi, sqlalchemy, stripe, anthropic, openai"

step "Backend: Lint & Format"
run "ruff check" .venv/bin/ruff check app tests scripts
run "ruff format --check" .venv/bin/ruff format --check app tests scripts

step "Backend: Datenbank erreichbar"
run "Postgres-Verbindung" $PY - <<'PYEOF'
import asyncio, os, asyncpg, sys
url = os.environ["TEST_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
async def main():
    c = await asyncpg.connect(url); await c.fetchval("select 1"); await c.close()
try: asyncio.run(main())
except Exception as e: print("DB nicht erreichbar:", e); sys.exit(1)
PYEOF

step "Backend: Testsuite (pytest)"
run "pytest (alle Suiten)" $PY -m pytest -q -p no:cacheprovider

step "Backend: Migrationen (gegen leere Datenbank)"
MIG_DB="${TEST_DATABASE_URL%/*}/werkpilot_migrate"
ADMIN_URL="${TEST_DATABASE_URL%/*}/postgres"; ADMIN_URL="${ADMIN_URL/postgresql+asyncpg:/postgresql:}"
psql -q "$ADMIN_URL" -c "DROP DATABASE IF EXISTS werkpilot_migrate" -c "CREATE DATABASE werkpilot_migrate" >>"$LOG" 2>&1 || bad "Migrations-DB anlegen (psql)"
( export DATABASE_URL="$MIG_DB"
  .venv/bin/alembic -q upgrade head >>"$LOG" 2>&1 && .venv/bin/alembic check >>"$LOG" 2>&1 && .venv/bin/alembic -q downgrade base >>"$LOG" 2>&1 ) && ok "alembic upgrade head + check + downgrade base" || bad "alembic (Modelle ≠ Migration oder Downgrade defekt?)"
psql -q "$ADMIN_URL" -c "DROP DATABASE IF EXISTS werkpilot_migrate" >>"$LOG" 2>&1

step "Backend: Abhängigkeitsscan"
.venv/bin/pip freeze --exclude-editable > "$ROOT/.req-freeze.txt" 2>/dev/null
if .venv/bin/pip-audit -r "$ROOT/.req-freeze.txt" --strict >>"$LOG" 2>&1; then ok "pip-audit"; else bad "pip-audit (siehe .test-all.log)"; fi
rm -f "$ROOT/.req-freeze.txt"

# ------------------------------------------------------------------ Frontend
step "Frontend: Abhängigkeiten"
cd "$ROOT/frontend"
[ -d node_modules ] || npm ci --no-audit --no-fund >>"$LOG" 2>&1 || bad "npm ci"
step "Frontend: Lint"
run "eslint" npm run -s lint
step "Frontend: Build"
if npm run -s build >>"$LOG" 2>&1; then ok "next build"; else bad "next build (siehe .test-all.log)"; fi
step "Frontend: Abhängigkeitsscan (nur Produktion)"
if npm audit --omit=dev --audit-level=high >>"$LOG" 2>&1; then ok "npm audit --omit=dev"; else bad "npm audit"; fi

# ------------------------------------------------------------------ Smoke
if [ "$QUICK" = "1" ]; then step "Smoke-Test übersprungen (--quick)"; else
step "Smoke-Test: API und Web starten"
SMOKE_DB="${SMOKE_DATABASE_URL:-${TEST_DATABASE_URL%/*}/werkpilot_smoke}"
ADMIN_URL="${TEST_DATABASE_URL%/*}/postgres"; ADMIN_URL="${ADMIN_URL/postgresql+asyncpg:/postgresql:}"
psql -q "$ADMIN_URL" -c "DROP DATABASE IF EXISTS werkpilot_smoke" -c "CREATE DATABASE werkpilot_smoke" >>"$LOG" 2>&1 || bad "Smoke-DB anlegen (psql)"
API_PORT=18000; WEB_PORT=13000
# Reste früherer Läufe beenden (sonst EADDRINUSE und ein veralteter Server beantwortet die Prüfungen)
python3 "$ROOT/scripts/killport.py" $API_PORT $WEB_PORT >>"$LOG" 2>&1; sleep 1
cd "$ROOT/backend"
( export PYTHONUNBUFFERED=1 ENV=test DATABASE_URL="$SMOKE_DB" SECRET_KEY=test-secret-key-that-is-long-enough-123456 LLM_PROVIDER=mock EMAIL_PROVIDER=console AUTH_RATE_LIMIT_PER_MINUTE=100 \
         STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_testsecret INBOUND_EMAIL_WEBHOOK_SECRET=inbound-secret \
         FRONTEND_URL="http://localhost:$WEB_PORT" BASE_URL="http://localhost:$API_PORT" CORS_ORIGINS="http://localhost:$WEB_PORT" RATE_LIMIT_PER_MINUTE=1000 AUTH_RATE_LIMIT_PER_MINUTE=100
  .venv/bin/alembic -q upgrade head >>"$LOG" 2>&1
  exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port $API_PORT >"$ROOT/.smoke-api.log" 2>&1 ) &
API_PID=$!
cd "$ROOT/frontend"
( export BACKEND_URL="http://127.0.0.1:$API_PORT"; exec node node_modules/next/dist/bin/next start -p $WEB_PORT >"$ROOT/.smoke-web.log" 2>&1 ) &
WEB_PID=$!
cleanup() { kill $API_PID $WEB_PID 2>/dev/null; python3 "$ROOT/scripts/killport.py" $API_PORT $WEB_PORT >>"$LOG" 2>&1; wait $API_PID $WEB_PID 2>/dev/null; }
trap cleanup EXIT
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 && break; sleep 0.5; done
run "API /health" curl -sf "http://127.0.0.1:$API_PORT/health" -o /dev/null
step "Smoke-Test: Seiten"
PAGES="/ /funktionen /branchen /preise /demo /hilfe /kontakt /registrieren /anmelden /ratgeber /impressum /datenschutz /agb /widerruf /termin /app /admin /sitemap.xml /robots.txt /api/public/config /api/billing/plans"
for p in $PAGES; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT$p")
  [ "$code" = "200" ] && ok "GET $p" || bad "GET $p → $code"
done
step "Smoke-Test: API-Kundenreise (Registrierung → Bestätigung → Login → Anfrage → Entwurf → Versand)"
cd "$ROOT/backend"
if $PY - "$API_PORT" "$ROOT/.smoke-api.log" <<'PYEOF' >>"$LOG" 2>&1; then ok "API-Kundenreise"; else bad "API-Kundenreise (siehe .test-all.log)"; fi
import json, re, sys, time, urllib.request, urllib.error
port, logfile = sys.argv[1], sys.argv[2]
B = f"http://127.0.0.1:{port}"
def call(method, path, body=None, headers=None, expect=200):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(B + path, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: payload = r.read().decode(); status = r.status
    except urllib.error.HTTPError as e: payload = e.read().decode(); status = e.code
    assert status == expect, f"{method} {path} → {status} {payload[:300]}"
    return json.loads(payload) if payload else {}
email = f"smoke-{int(time.time())}@beispiel-elektro.de"; pw = "Elbe-Kran-Moewe-33"
call("POST", "/api/auth/register", {"email": email, "password": pw, "full_name": "Smoke Test", "company": "Smoke Elektro", "trade": "elektro", "accept_terms": True, "accept_privacy": True}, expect=201)
time.sleep(0.5)
m = [*re.finditer(r"bestaetigen\?token=([A-Za-z0-9_\-]+)", open(logfile).read())]
assert m, "kein Bestätigungslink im API-Log"
v = call("POST", "/api/auth/verify-email", {"token": m[-1].group(1)})
assert "access_token" not in v, "Bestätigung darf keine Sitzung erzeugen"
tok = call("POST", "/api/auth/login", {"email": email, "password": pw})["access_token"]
H = {"Authorization": f"Bearer {tok}"}
t = call("GET", "/api/tenant", headers=H); assert t["entitlements"]["status"] == "trialing"
inq = call("POST", "/api/inquiries", {"subject": "Stromausfall", "body": "Seit heute früh kein Strom, Sicherung fliegt raus. Musterweg 5, 22303 Hamburg, 0170 1234567", "sender_name": "Petra", "sender_email": "petra@kunde-beispiel.de"}, headers=H, expect=201)
assert inq["category"] == "notfall" and inq["priority"] == "urgent" and inq["status"] == "needs_review", inq
d = call("GET", f"/api/inquiries/{inq['id']}", headers=H)["drafts"][0]
r = call("POST", f"/api/drafts/{d['id']}/approve", {}, headers=H); assert r["delivery_status"] == "simulated"
dash = call("GET", "/api/tenant/dashboard", headers=H); assert dash["inquiries"]["open"] == 1 and dash["replies_7d"] == 1
rep = call("POST", "/api/tenant/reports/weekly", headers=H); assert rep["data"]["inquiries_new"] == 1
call("GET", "/api/admin/overview", headers=H, expect=403)
demo = call("POST", "/api/public/demo/classify", {"text": "Heizung ausgefallen, kein Warmwasser, bitte dringend kommen!", "trade": "shk"})
assert demo["classification"]["category"] == "notfall"
print("Kundenreise ok:", email)
PYEOF
step "Smoke-Test: Worker-Zeitplan (ein Durchlauf)"
if ( export ENV=test DATABASE_URL="$SMOKE_DB" SECRET_KEY=test-secret-key-that-is-long-enough-123456 LLM_PROVIDER=mock EMAIL_PROVIDER=console STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_testsecret
     timeout 20 $PY -m app.workers.runner >>"$LOG" 2>&1; psql -tA "${SMOKE_DB/postgresql+asyncpg:/postgresql:}" -c "select count(*) from agent_runs where status='ok'" | grep -qE '^[1-9]' ); then ok "Worker: Agenten liefen (agent_runs ok)"; else bad "Worker/Agenten"; fi

if [ "$BROWSER" = "1" ]; then
step "Browser-Durchlauf (Playwright)"
PW_DIR="$ROOT/.pw"; mkdir -p "$PW_DIR"
[ -f "$PW_DIR/package.json" ] || echo '{"name":"werkpilot-browsertest","private":true,"type":"module"}' > "$PW_DIR/package.json"
if [ ! -d "$PW_DIR/node_modules/playwright" ]; then (cd "$PW_DIR" && npm i --no-audit --no-fund playwright@1.58.2 >>"$LOG" 2>&1) || bad "Playwright installieren"; fi
cat > "$PW_DIR/flow.mjs" <<'JSEOF'
import { chromium } from "playwright";
import fs from "node:fs";
const [WEB, LOGFILE, EXE] = [process.env.WEB, process.env.API_LOG, process.env.PLAYWRIGHT_CHROMIUM];
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const email = `pw-${Date.now()}@beispiel-elektro.de`, pw = "Elbe-Kran-Moewe-33";
await page.goto(`${WEB}/demo`); await page.getByRole("button", { name: "Anfrage verarbeiten" }).click(); await page.getByRole("heading", { name: "Antwortentwurf" }).waitFor();
await page.goto(`${WEB}/registrieren`);
await page.fill('input[name="company"]', "PW Elektro"); await page.fill('input[name="full_name"]', "Kai"); await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', pw);
await page.check('input[name="terms"]'); await page.check('input[name="privacy"]'); await page.getByRole("button", { name: "Konto anlegen" }).click(); await page.getByText("Fast geschafft").waitFor();
let m = null;
for (let i = 0; i < 20 && !m; i++) { // Link erscheint im API-Log, sobald die Registrierungsmail "gesendet" wurde
  await new Promise((r) => setTimeout(r, 500));
  const all = [...fs.readFileSync(LOGFILE, "utf8").matchAll(/to=([^\s]+@beispiel-elektro\.de)[\s\S]*?bestaetigen\?token=([A-Za-z0-9_\-]+)|bestaetigen\?token=([A-Za-z0-9_\-]+)[\s\S]*?to=([^\s]+)/g)];
  const lines = fs.readFileSync(LOGFILE, "utf8").split("\n").filter((l) => l.includes(email) && l.includes("bestaetigen?token="));
  const hit = lines.length ? lines[lines.length - 1].match(/bestaetigen\?token=([A-Za-z0-9_\-]+)/) : null;
  if (hit) m = hit; void all;
}
if (!m) throw new Error("kein Bestätigungslink für " + email + " im API-Log");
await page.goto(`${WEB}/bestaetigen?token=${m[1]}`); await page.waitForURL(/anmelden/, { timeout: 15000 });
await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', pw); await page.getByRole("button", { name: "Anmelden" }).click();
await page.waitForURL(/\/app/, { timeout: 15000 }); await page.getByText("Übersicht").first().waitFor();
await page.goto(`${WEB}/app/anfragen`); await page.getByRole("button", { name: "Anfrage erfassen" }).click();
await page.fill('input[name="sender_email"]', "petra@kunde-beispiel.de"); await page.fill('input[name="subject"]', "Stromausfall"); await page.fill('textarea[name="body"]', "Kein Strom, Sicherung fliegt raus. Musterweg 5, 22303 Hamburg, 0170 1234567");
await page.getByRole("button", { name: "Erfassen und verarbeiten" }).click(); await page.getByRole("link", { name: "Stromausfall" }).click();
await page.getByRole("button", { name: "Freigeben & senden" }).click(); await page.getByText("Antwort gesendet.").waitFor();
await page.goto(`${WEB}/admin`); await page.waitForURL(/\/app$/, { timeout: 10000 });
await browser.close(); if (errors.length) throw new Error("Seitenfehler: " + errors.join(" | ")); console.log("Browser-Durchlauf ok");
JSEOF
if (cd "$PW_DIR" && WEB="http://127.0.0.1:$WEB_PORT" API_LOG="$ROOT/.smoke-api.log" PLAYWRIGHT_CHROMIUM="${PLAYWRIGHT_CHROMIUM:-}" timeout 180 node flow.mjs >>"$LOG" 2>&1); then ok "Playwright: Demo → Registrierung → Bestätigung → Login → Anfrage → Versand"; else bad "Playwright-Durchlauf (siehe .test-all.log)"; fi
# Tarifdaten: Frontend (src/lib/plans.ts) muss mit der API übereinstimmen
if $PY "$ROOT/scripts/check_plans.py" "http://127.0.0.1:$API_PORT" >>"$LOG" 2>&1; then ok "Tarifdaten Frontend = API"; else bad "Tarifdaten weichen ab (scripts/check_plans.py)"; fi
# Weitere Browserprüfungen: acht Kernabläufe, Linkprüfung, Barrierefreiheit (axe)
cp "$ROOT/scripts/browser/"*.mjs "$PW_DIR/"
if [ ! -d "$PW_DIR/node_modules/@axe-core/playwright" ]; then (cd "$PW_DIR" && npm i --no-audit --no-fund @axe-core/playwright@4.10.2 >>"$LOG" 2>&1) || bad "axe installieren"; fi
if (cd "$PW_DIR" && WEB="http://127.0.0.1:$WEB_PORT" API="http://127.0.0.1:$API_PORT" API_LOG="$ROOT/.smoke-api.log" PLAYWRIGHT_CHROMIUM="${PLAYWRIGHT_CHROMIUM:-}" timeout 600 node flows.mjs >>"$LOG" 2>&1); then ok "Playwright: acht Kernabläufe (Start, Demo, Konto, Passwort, Schutz, Mandanten, Export/Löschung, Mobil/Tastatur)"; else bad "Kernabläufe (siehe .test-all.log)"; fi
if (cd "$PW_DIR" && WEB="http://127.0.0.1:$WEB_PORT" PLAYWRIGHT_CHROMIUM="${PLAYWRIGHT_CHROMIUM:-}" timeout 300 node linkcheck.mjs >>"$LOG" 2>&1); then ok "Linkprüfung öffentliche Seiten"; else bad "Linkprüfung (siehe .test-all.log)"; fi
if (cd "$PW_DIR" && WEB="http://127.0.0.1:$WEB_PORT" PLAYWRIGHT_CHROMIUM="${PLAYWRIGHT_CHROMIUM:-}" timeout 600 node axe.mjs >>"$LOG" 2>&1); then ok "Barrierefreiheit (axe, WCAG 2.1 AA): keine schweren Verstöße"; else bad "Barrierefreiheit (siehe .test-all.log)"; fi
fi
cleanup; trap - EXIT
psql -q "$ADMIN_URL" -c "DROP DATABASE IF EXISTS werkpilot_smoke" >>"$LOG" 2>&1
fi

# ------------------------------------------------------------------ HTML-Bericht
REPORT="$ROOT/test-report.html"
python3 "$ROOT/scripts/test_report.py" "$RESULTS" "$LOG" "$REPORT" "$STARTED_AT" "$(( $(date +%s) - T0 ))" "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo '-')" "$*" && printf "Bericht: %s\n" "$REPORT"
rm -f "$RESULTS"

# ------------------------------------------------------------------ Ergebnis
printf "\n${YEL}== Ergebnis ==${NC}\n"
printf "Bestanden: %d   Fehlgeschlagen: %d   (Details: %s)\n" "${#PASSES[@]}" "${#FAILS[@]}" "$LOG"
for f in "${FAILS[@]:-}"; do [ -n "$f" ] && printf "${RED}  ✗ %s${NC}\n" "$f"; done
[ "${#FAILS[@]}" -eq 0 ] && { printf "${GRN}ALLE TESTS BESTANDEN${NC}\n"; exit 0; } || exit 1
