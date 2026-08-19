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
  echo "      2. Oben LTS wählen, dann macOS, dann Prebuilt Installer"
  echo "      3. Die geladene .pkg-Datei doppelklicken und durchklicken"
  echo "      4. Dieses Fenster schließen und hier wieder doppelklicken"
  echo ""
  read -r -p "  Enter drücken zum Schließen."
  exit 1
fi

echo "  ✓ Node $(node -v)"

# Aktualisierung holen, wenn das hier eine Git-Arbeitskopie ist.
#
# Ohne das müsste man für jede Verbesserung wieder ins Terminal -- und genau
# das soll dieser Starter ersparen. Absichtlich nur, wenn nichts Eigenes
# geändert wurde: fremde Änderungen wegzuräumen wäre eine Überraschung, die
# ein Startknopf nicht machen darf.
# `.git` liegt bei einer geklonten Fassung eine Ebene höher, nicht in diesem
# Ordner -- deshalb git selbst fragen statt nach dem Verzeichnis zu sehen.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    echo ""
    echo "  Suche nach Aktualisierungen …"
    vorher=$(git rev-parse HEAD 2>/dev/null)
    if git pull --ff-only 2>&1 | sed 's/^/    /'; then
      # Kam etwas Neues, können auch neue Bibliotheken dazugekommen sein.
      # Ohne diesen Schritt fehlt genau die Bibliothek, die die neue Funktion
      # braucht -- und der Fehler zeigt sich erst viel später.
      if [ "$(git rev-parse HEAD 2>/dev/null)" != "$vorher" ]; then
        echo "    Neuer Stand geladen. Pakete werden abgeglichen …"
        npm install --silent 2>&1 | tail -3 | sed 's/^/    /'
      fi
    else
      echo "    (nicht möglich -- es geht mit dem vorhandenen Stand weiter)"
    fi
  else
    echo ""
    echo "  Eigene Änderungen im Ordner -- es wird nichts aktualisiert."
  fi
fi

echo ""

node scripts/testversion.mjs
ergebnis=$?

echo ""
if [ $ergebnis -ne 0 ]; then
  echo "  Der Start wurde beendet (Code $ergebnis)."
  echo "  Oben im Fenster steht, woran es lag."
fi
read -r -p "  Enter drücken zum Schließen."
