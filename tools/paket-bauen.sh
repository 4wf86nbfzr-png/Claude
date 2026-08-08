#!/usr/bin/env bash
# ============================================================================
#  Baut das ZIP, das bei Netlify per Drag-and-drop hochgeladen wird.
# ----------------------------------------------------------------------------
#  Warum ein eigenes Skript?
#
#  Beim Ziehen-und-Ablegen führt Netlify keinen Build aus — es veröffentlicht,
#  was im Paket liegt. Die Formularfunktion braucht aber ihre Pakete
#  (pdfkit, docx, nodemailer). Die müssen also mit hinein, und zwar nur die
#  für den Betrieb, nicht die Werkzeuge.
#
#  Was nicht hineingehört, steht in AUSSEN: Arbeitsdateien, die im Netz nichts
#  zu suchen haben.
#
#  Aufruf:  bash tools/paket-bauen.sh
#  Ergebnis: herm-website-netlify.zip im Projektordner
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ZIEL="herm-website-netlify.zip"

echo "→ Abhängigkeiten frisch installieren (nur Betrieb, keine Werkzeuge)"
npm ci --omit=dev --no-audit --no-fund >/dev/null

echo "→ Prüfen, dass die Funktion lädt"
node -e "require('./netlify/functions/formular.js'); require('./api/formular.js')"

AUSSEN=(
  "*.git*"          "tools/*"        "docs/*"
  "*.md"            ".vorschau-stand"
  "vercel.json"     ".vercelignore"  ".htaccess"  ".nojekyll"
  "$ZIEL"
)

echo "→ Paket schnüren"
rm -f "$ZIEL"
zip -qr "$ZIEL" . -x "${AUSSEN[@]}"

echo
echo "Fertig: $ZIEL  ($(du -h "$ZIEL" | cut -f1))"
echo
echo "Enthalten:"
unzip -l "$ZIEL" | awk 'NR>3 && $4 !~ /^node_modules/ && $4 != "" {print "   " $4}' | head -30
echo "   node_modules/  ($(unzip -l "$ZIEL" | grep -c "node_modules/") Dateien)"
echo
echo "Weiter geht es in README.md unter „Auf Netlify veröffentlichen“."
