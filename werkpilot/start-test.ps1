# Startet Clairify komplett lokal zum Testen (Windows, PowerShell). Voraussetzung: Docker Desktop.
#   .\start-test.ps1            starten
#   .\start-test.ps1 stop       anhalten (Daten bleiben)
#   .\start-test.ps1 reset      alles löschen und frisch starten
param([string]$Action = "start")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host "Docker fehlt. Bitte Docker Desktop installieren: https://www.docker.com/products/docker-desktop/"; exit 1 }
if ($Action -eq "stop") { docker compose stop; Write-Host "Angehalten."; exit 0 }
if ($Action -eq "reset") { docker compose down -v; Remove-Item .env -ErrorAction SilentlyContinue; Write-Host "Zurückgesetzt." }
if (-not (Test-Path .env)) {
  $secret = -join ((1..64) | ForEach-Object { "0123456789abcdef"[(Get-Random -Maximum 16)] })
  (Get-Content .env.example) -replace '^SECRET_KEY=.*', "SECRET_KEY=$secret" -replace '^EMAIL_FROM=.*', 'EMAIL_FROM="Clairify <noreply@example.com>"' -replace '^COOKIE_SECURE=.*', 'COOKIE_SECURE=false' | Set-Content .env -Encoding utf8
  Write-Host ".env für den Testbetrieb angelegt."
}
Write-Host "Baue und starte die Dienste (beim ersten Mal einige Minuten) ..."
docker compose up -d --build
Write-Host -NoNewline "Warte auf die API "
$ok = $false
for ($i = 0; $i -lt 120; $i++) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health -TimeoutSec 3 | Out-Null; $ok = $true; break } catch { Write-Host -NoNewline "."; Start-Sleep 2 } }
if (-not $ok) { Write-Host "`nAPI antwortet nicht. Logs: docker compose logs api"; exit 1 }
Write-Host " bereit."
for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/ -TimeoutSec 3 | Out-Null; break } catch { Start-Sleep 2 } }
Write-Host "Lege Beispielbetrieb an ..."
$seed = docker compose exec -T api python scripts/demo_seed.py | ConvertFrom-Json
docker compose exec -T api python scripts/make_operator.py $seed.email | Out-Null
Write-Host ""
Write-Host "=========================================================="
Write-Host "  Clairify läuft lokal."
Write-Host "  Website:    http://localhost:3000"
Write-Host "  Dashboard:  http://localhost:3000/anmelden"
Write-Host "  Betreiber:  http://localhost:3000/admin"
Write-Host "  API:        http://localhost:8000/docs"
Write-Host "  E-Mail:     $($seed.email)"
Write-Host "  Passwort:   $($seed.password)"
Write-Host "  Mails werden nur protokolliert (docker compose logs api), KI regelbasiert ohne Anbieter."
Write-Host "  Anhalten: .\start-test.ps1 stop   Zurücksetzen: .\start-test.ps1 reset"
Write-Host "=========================================================="
