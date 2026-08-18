#!/bin/bash
#
# Doppelklick-Starter für macOS.
#
# Eine .command-Datei öffnet beim Doppelklick ein Terminal und führt sich
# darin aus. Das ist der kürzeste Weg von „entpackt" zu „läuft", ohne dass
# jemand Befehle abtippen muss.
#
# Beim ersten Mal wehrt macOS die Datei ab, weil sie aus dem Netz kommt
# ("nicht verifizierter Entwickler"). Dann einmal mit rechts anklicken →
# Öffnen → Öffnen. Danach nie wieder.

# In den Ordner wechseln, in dem diese Datei liegt -- sonst sucht npm im
# Benutzerverzeichnis nach dem Projekt.
cd "$(dirname "$0")" || exit 1

echo ""
echo "  JARVIS wird gestartet …"
echo "  Ordner: $(pwd)"
echo ""

# Ein per Doppelklick gestartetes Skript liest ~/.zshrc nicht, kennt also die
# dort gesetzten Pfade nicht. Deshalb die beiden üblichen Orte ergänzen --
# aber **hinten**: ein bereits gefundenes Node soll gewinnen, sonst überdeckt
# eine alte Homebrew-Fassung die neuere, die der Benutzer eingerichtet hat.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

if ! command -v node >/dev/null 2>&1; then
  echo "  ✗ Node ist nicht installiert."
  echo ""
  echo "    JARVIS braucht Node, um zu laufen. Kostenlos und in zwei Minuten:"
  echo ""
  echo "      1. https://nodejs.org öffnen"
  echo "      2. Den grünen Knopf mit „LTS\" anklicken"
  echo "      3. Die geladene .pkg-Datei doppelklicken und durchklicken"
  echo "      4. Dieses Fenster schließen und hier wieder doppelklicken"
  echo ""
  read -r -p "  Enter drücken zum Schließen."
  exit 1
fi

echo "  ✓ Node $(node -v)"
echo ""

node scripts/testversion.mjs
ergebnis=$?

echo ""
if [ $ergebnis -ne 0 ]; then
  echo "  Der Start wurde beendet (Code $ergebnis)."
  echo "  Oben im Fenster steht, woran es lag."
fi
read -r -p "  Enter drücken zum Schließen."
