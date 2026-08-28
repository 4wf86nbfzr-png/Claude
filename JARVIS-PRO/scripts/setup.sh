#!/usr/bin/env bash
#
# pnpm setup - richtet die lokalen Bestandteile ein.
#
# Eigenschaften, auf die es hier ankommt:
#   - idempotent: mehrfaches Ausfuehren aendert nichts Zusaetzliches
#   - nicht destruktiv: es wird nichts geloescht und nichts ueberschrieben,
#     ohne vorher zu sichern
#   - nachvollziehbar: jeder Schritt sagt, was er tut und warum
#
# Was dieses Skript NICHT tut: nach Geheimnissen fragen, Konten verbinden
# oder etwas ins Internet schicken. Das sind eigene, ausdrueckliche Schritte.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VENDOR="$ROOT/vendor"
MODELS="$ROOT/models"
OS="$(uname -s)"
ARCH="$(uname -m)"

blau()  { printf '\033[36m%s\033[0m\n' "$*"; }
gruen() { printf '\033[32m%s\033[0m\n' "$*"; }
gelb()  { printf '\033[33m%s\033[0m\n' "$*"; }
rot()   { printf '\033[31m%s\033[0m\n' "$*"; }

schritt() { echo; blau "== $* =="; }

sichern() {
  # Sichert einen vorhandenen Pfad datiert, statt ihn zu ueberschreiben.
  local pfad="$1"
  if [ -e "$pfad" ]; then
    local ziel="${pfad}.gesichert-$(date +%Y%m%d-%H%M%S)"
    gelb "  Vorhanden: $pfad"
    gelb "  Wird gesichert nach: $ziel"
    mv "$pfad" "$ziel"
  fi
}

# ---------------------------------------------------------------------------
schritt "Voraussetzungen pruefen"

fehlt=0
for cmd in node pnpm git cmake make; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "  ok    $cmd  $($cmd --version 2>&1 | head -1)"
  else
    rot "  FEHLT $cmd"
    fehlt=1
  fi
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NODE_MINOR="$(node -p 'process.versions.node.split(".")[1]')"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
  rot "  Node $(node -v) ist zu alt. Gebraucht wird 22.13 oder neuer (wegen node:sqlite)."
  fehlt=1
fi

if [ "$fehlt" -eq 1 ]; then
  echo
  rot "Es fehlen Voraussetzungen. Nichts wurde veraendert."
  if [ "$OS" = "Darwin" ]; then
    echo "  brew install node pnpm git cmake"
  else
    echo "  sudo apt-get install -y nodejs git cmake build-essential"
    echo "  corepack enable && corepack prepare pnpm@10.33.0 --activate"
  fi
  exit 1
fi
gruen "  Alle Voraussetzungen vorhanden."

# ---------------------------------------------------------------------------
schritt "Projektabhaengigkeiten"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
gruen "  Abhaengigkeiten installiert."

# ---------------------------------------------------------------------------
schritt "Verzeichnisse"
mkdir -p "$VENDOR" "$MODELS" var var/bench backups logs
gruen "  vendor/ models/ var/ backups/ logs/ liegen bereit."

# ---------------------------------------------------------------------------
schritt "Konfigurationsdatei"
if [ ! -f .env ]; then
  cp .env.example .env
  gruen "  .env aus .env.example angelegt."
  gelb "  Bitte die Rufnummern eintragen. Geheimnisse gehoeren NICHT hier hinein."
else
  gruen "  .env ist vorhanden und wird nicht angefasst."
fi

# ---------------------------------------------------------------------------
schritt "whisper.cpp (Spracherkennung)"
WHISPER_DIR="$VENDOR/whisper.cpp"
if [ -d "$WHISPER_DIR/.git" ]; then
  gruen "  Bereits vorhanden unter $WHISPER_DIR - es wird nicht neu geklont."
  echo "  Aktualisieren waere: git -C $WHISPER_DIR pull && erneut bauen"
else
  echo "  Wird geklont nach $WHISPER_DIR"
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$WHISPER_DIR"
fi

if [ -x "$WHISPER_DIR/build/bin/whisper-cli" ]; then
  gruen "  Programm ist bereits gebaut."
else
  echo "  Wird gebaut. Das dauert ein paar Minuten."
  if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then
    echo "  Apple Silicon erkannt - mit Metal."
    cmake -B "$WHISPER_DIR/build" -S "$WHISPER_DIR" -DGGML_METAL=ON
  else
    cmake -B "$WHISPER_DIR/build" -S "$WHISPER_DIR"
  fi
  cmake --build "$WHISPER_DIR/build" --config Release -j
fi

# Modelle: klein und mittel, damit gemessen und nicht geraten werden kann.
for MODELL in small medium; do
  ZIEL="$MODELS/ggml-$MODELL.bin"
  if [ -f "$ZIEL" ]; then
    gruen "  Modell $MODELL liegt bereits vor."
    continue
  fi
  echo "  Modell $MODELL wird geladen (mehrere hundert MB)."
  bash "$WHISPER_DIR/models/download-ggml-model.sh" "$MODELL" "$MODELS" \
    || gelb "  Download fehlgeschlagen - bitte spaeter erneut versuchen."
done

# ---------------------------------------------------------------------------
schritt "Piper (Sprachausgabe)"
PIPER_DIR="$VENDOR/piper"
if [ -x "$PIPER_DIR/piper" ] || command -v piper >/dev/null 2>&1; then
  gruen "  Piper ist vorhanden."
else
  gelb "  Piper wird nicht automatisch installiert."
  echo "  Grund: die Veroeffentlichungen unterscheiden sich je nach Plattform,"
  echo "  und ein falsch geratener Download waere schlimmer als ein Hinweis."
  echo
  echo "  Bitte die zur Plattform passende Ausgabe von Piper nach $PIPER_DIR legen"
  echo "  und die deutsche Stimme de_DE-thorsten-high dazu."
  echo "  Danach in .env eintragen:"
  echo "    PIPER_BIN=$PIPER_DIR/piper"
  echo "    PIPER_VOICE=$MODELS/de_DE-thorsten-high.onnx"
fi

# ---------------------------------------------------------------------------
schritt "Pfade in .env eintragen"
setze_env() {
  local schluessel="$1" wert="$2"
  if grep -q "^${schluessel}=" .env; then
    local vorhanden
    vorhanden="$(grep "^${schluessel}=" .env | head -1 | cut -d= -f2-)"
    if [ -n "$vorhanden" ]; then
      gruen "  $schluessel ist bereits gesetzt - bleibt unveraendert."
      return
    fi
  fi
  # In-Place-Bearbeitung, die unter macOS und Linux gleich funktioniert.
  local tmp
  tmp="$(mktemp)"
  grep -v "^${schluessel}=" .env > "$tmp" || true
  echo "${schluessel}=${wert}" >> "$tmp"
  mv "$tmp" .env
  gruen "  $schluessel gesetzt."
}

if [ -x "$WHISPER_DIR/build/bin/whisper-cli" ]; then
  setze_env WHISPER_BIN "$WHISPER_DIR/build/bin/whisper-cli"
fi
if [ -f "$MODELS/ggml-medium.bin" ]; then
  setze_env WHISPER_MODEL "$MODELS/ggml-medium.bin"
elif [ -f "$MODELS/ggml-small.bin" ]; then
  setze_env WHISPER_MODEL "$MODELS/ggml-small.bin"
fi

# ---------------------------------------------------------------------------
schritt "Pruefen"
pnpm test >/dev/null 2>&1 && gruen "  Alle Tests laufen durch." || rot "  Tests schlagen fehl - bitte 'pnpm test' ansehen."

# ---------------------------------------------------------------------------
echo
gruen "======================================================================"
gruen "Einrichtung abgeschlossen."
gruen "======================================================================"
cat <<'HINWEIS'

Was jetzt noch fehlt, und warum es nicht automatisch passiert ist:

  1. PINs festlegen
       pnpm tsx scripts/hash-pin.ts
     Zweimal ausfuehren: einmal fuer die Anmelde-PIN, einmal fuer die
     Freigabe-PIN. Die beiden muessen sich unterscheiden.
     Die Hashes gehoeren in den Schluesselbund, nicht in die .env.

  2. Messen, welches Sprachmodell auf diesem Rechner taugt
       pnpm bench:speech
     Erst danach in .env festlegen. Ohne Messung ist jede Empfehlung geraten.

  3. Ausprobieren, ohne dass irgendetwas passiert
       pnpm simulate:call
       pnpm dry-run

  4. Konten verbinden - jeweils einzeln und ausdruecklich
       pnpm connect:microsoft
       pnpm connect:whatsapp

  5. Telefonie einrichten
       pnpm configure:gateway

Nichts davon sendet etwas oder ruft jemanden an. Der Betriebsmodus steht
weiterhin auf "simulation".

HINWEIS
