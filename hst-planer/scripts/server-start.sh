#!/usr/bin/env bash
# Startet den gebauten Server im Hintergrund (fuer Rauchtests).
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3100}"
pkill -f "[n]ext-server" >/dev/null 2>&1
sleep 1
setsid nohup npx next start -p "$PORT" > /tmp/hst-planer.log 2>&1 < /dev/null &
for _ in $(seq 1 30); do
  sleep 1
  if curl -sf -o /dev/null "http://localhost:$PORT/anmelden"; then
    echo "Server laeuft auf http://localhost:$PORT"
    exit 0
  fi
done
echo "Server startet nicht – siehe /tmp/hst-planer.log"
tail -20 /tmp/hst-planer.log
exit 1
